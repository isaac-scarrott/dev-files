/** A session message as far as the prediction reads it; the host's `SessionMessageInfo` satisfies it. */
export interface Msg {
  readonly type: string
  readonly status?: string
  readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
  readonly tokens?: {
    readonly input: number
    readonly output: number
    readonly reasoning: number
    readonly cache: { readonly read: number; readonly write: number }
  }
  readonly time?: { readonly created?: unknown; readonly streamed?: unknown; readonly completed?: unknown }
}

/** The model the next prompt is sent with, as the composer reports it. */
export interface Selection {
  readonly providerID: string
  readonly modelID: string
  readonly variant?: string
}

export interface Config {
  /** How long the provider keeps a prompt cache entry after its last use. */
  readonly ttlMs: number
  /** Contexts below this many tokens never warn. */
  readonly minTokens: number
}

export type Notice =
  | { readonly kind: "expired"; readonly tokens: number }
  | { readonly kind: "model"; readonly tokens: number }
  | { readonly kind: "compacted" }

/** The state the next message will meet, and when the warm cache runs out, if it is warm. */
export interface Forecast {
  readonly notice?: Notice
  /** Epoch ms at which a warm cache expires; absent when nothing is waiting on the clock. */
  readonly expiresAt?: number
}

/** Epoch milliseconds of a timestamp the host may hand over as a number, a Date or a string. */
export function millis(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") {
    const parsed = Date.parse(value)

    return Number.isNaN(parsed) ? undefined : parsed
  }
  if (value && typeof value === "object" && "epochMillis" in value) return millis(value.epochMillis)
}

/** The size the context ring shows: every token the last step read, wrote or produced. */
export function contextSize(tokens: NonNullable<Msg["tokens"]>) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

/**
 * The cache is touched when a step's request starts, not when its reply ends, so the step's creation is the anchor;
 * the first streamed and the completed timestamps are the fallbacks for a message that lacks it.
 */
export function touched(message: Msg) {
  return millis(message.time?.created) ?? millis(message.time?.streamed) ?? millis(message.time?.completed)
}

/**
 * The composer reports the model's default variant as undefined, a stored message as "default" (or empty): one choice.
 */
export function variantOf(variant: string | undefined) {
  return variant && variant !== "default" ? variant : ""
}

/** A model id without a leading `provider/`, which some sources write and others leave out. */
export function bareId(id: string, providerID: string) {
  return id.startsWith(`${providerID}/`) ? id.slice(providerID.length + 1) : id
}

/**
 * What the next prompt will cost in cache terms, read from the tail of the conversation: the latest assistant step
 * with usage is the last measure (the host's context ring reads the same step) and the time anchor. A step without
 * usage that has ended (a failed one) made no cache call to count and is passed over; one still running means a
 * request is in flight and silences the warning. A prompt after the measured step also silences it, as does a reply
 * under way, except a completed compaction.
 */
export function forecast(input: {
  messages: ReadonlyArray<Msg>
  now: number
  config: Config
  selection?: Selection
}): Forecast {
  const messages = input.messages
  let compacted = false
  let step: Msg | undefined

  // Only the tail is read, so a long conversation neither costs a scan nor subscribes to every message.
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]

    if (!message) continue

    if (message.type === "user") return {}

    if (message.type === "compaction" && message.status === "completed") compacted = true

    if (message.type !== "assistant") continue

    if (!message.tokens) {
      if (millis(message.time?.completed) === undefined) return {}
      continue
    }
    step = message
    break
  }

  const tokens = step?.tokens

  if (!step || !tokens) return {}

  const size = contextSize(tokens)

  if (size < input.config.minTokens) return {}

  if (compacted) return { notice: { kind: "compacted" } }

  // A provider that never reported cache use gives no basis for a claim about its cache.
  if (tokens.cache.read + tokens.cache.write === 0) return {}

  const at = touched(step)

  if (at === undefined) return {}
  const expiresAt = at + input.config.ttlMs

  if (input.now >= expiresAt) return { notice: { kind: "expired", tokens: size } }

  const next = input.selection
  const model = step.model

  if (next && model) {
    const changed =
      next.providerID !== model.providerID ||
      bareId(next.modelID, next.providerID) !== bareId(model.id, model.providerID) ||
      variantOf(next.variant) !== variantOf(model.variant)

    if (changed) return { notice: { kind: "model", tokens: size } }
  }

  return { expiresAt }
}

/** The host's number style for token counts: compact, whole, lower case ("180k"). */
export function humanize(count: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 })
    .format(count)
    .toLocaleLowerCase(locale)
}
