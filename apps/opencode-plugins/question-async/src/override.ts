// Pure logic for extending the native "question" tool with a non-blocking mode. Kept apart from server.ts so it can be
// tested without a live ToolEditor: everything here is plain data in, plain data (or a function) out.

export interface JsonObjectSchema {
  readonly type: "object"
  readonly properties: Record<string, unknown>
  readonly [key: string]: unknown
}

/** True only for the shape we know how to extend: a plain JSON Schema object with a `properties` map. Anything else
 * (a Zod instance, a different schema system, a future reshape) is left alone rather than guessed at. */
export function isJsonObjectSchema(input: unknown): input is JsonObjectSchema {
  if (typeof input !== "object" || input === null) return false
  const candidate = input as Record<string, unknown>
  return candidate.type === "object" && typeof candidate.properties === "object" && candidate.properties !== null
}

export const BLOCKING_PROPERTY = "blocking"

/** Adds `blocking` to a copy of the schema; never mutates the original. */
export function withBlocking(schema: JsonObjectSchema): JsonObjectSchema {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      [BLOCKING_PROPERTY]: {
        type: "boolean",
        description:
          "Default true: blocks your turn until the user answers. Set false to return at once and keep working on other things; the user's answer arrives later as a new message.",
      },
    },
  }
}

export function hasBlocking(schema: unknown): boolean {
  return isJsonObjectSchema(schema) && typeof schema.properties[BLOCKING_PROPERTY] === "object"
}

export function appendBlockingNote(description: string): string {
  return `${description}\n\nSet \`blocking: false\` to ask without waiting: your turn continues at once, and the user's answer arrives later as a new message.`
}

/** Best-effort text out of whatever shape the native tool's result turns out to be. */
export function answerTextOf(result: unknown): string {
  if (typeof result === "string") return result
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>
    if (typeof record.output === "string") return record.output
    if (typeof record.content === "string") return record.content
    if (record.output !== undefined) return JSON.stringify(record.output)
    if (record.content !== undefined) return JSON.stringify(record.content)
  }
  return JSON.stringify(result)
}

export function questionSummary(input: Record<string, unknown>): string {
  const questions = input.questions
  if (Array.isArray(questions)) {
    const texts = questions
      .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>).question : undefined))
      .filter((text): text is string => typeof text === "string")
    if (texts.length) return texts.join("; ")
  }
  return "your question"
}

export interface AsyncExecuteDeps<Input, Context, Result> {
  readonly original: (input: Input, context: Context) => Promise<Result>
  readonly sessionIDOf: (context: Context) => string
  readonly synthetic: (input: { sessionID: string; text: string; description: string }) => Promise<unknown>
  readonly log: (message: string) => void
}

/** The new `execute`: `blocking: false` fires the native ask, returns at once, and delivers the eventual answer (or
 * dismissal) as a synthetic message. `blocking` default/true calls the native execute unchanged. */
export function createAsyncExecute<Context, Result>(
  deps: AsyncExecuteDeps<Record<string, unknown>, Context, Result>,
): (input: Record<string, unknown>, context: Context) => Promise<Result | { output: string }> {
  return async (rawInput, context) => {
    const { [BLOCKING_PROPERTY]: blocking, ...rest } = rawInput ?? {}
    if (blocking !== false) return deps.original(rest, context)

    const sessionID = deps.sessionIDOf(context)
    const summary = questionSummary(rest)
    void deps
      .original(rest, context)
      .then((result) =>
        deps.synthetic({
          sessionID,
          text: `The user answered your non-blocking question: ${answerTextOf(result)}`,
          description: "Non-blocking question answered",
        }),
      )
      .catch((error: unknown) => {
        deps.log(`non-blocking question did not get an answer: ${String(error)}`)
        return deps
          .synthetic({
            sessionID,
            text: `Your non-blocking question ("${summary}") was dismissed without an answer.`,
            description: "Non-blocking question dismissed",
          })
          .catch(() => undefined)
      })

    return {
      output: "The question was sent to the user. Continue with other work now; their answer will arrive later as a new message.",
    }
  }
}
