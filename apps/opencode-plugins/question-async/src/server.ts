import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Plugin } from "@opencode/plugin"
import { appendBlockingNote, createAsyncExecute, hasBlocking, isJsonObjectSchema, withBlocking } from "./override.js"

const QUESTION_TOOL = "question"
const STATUS_FILE = join(homedir(), ".local", "share", "opencode", "question-async", "status.json")

/** Shallow, crash-proof description of whatever shape the native tool's schema turns out to be, for diagnosis without
 * a debugger: typeof/keys only, never the schema's own (possibly huge or circular) content. */
function describeSchema(input: unknown): Record<string, unknown> {
  try {
    if (input === null || input === undefined) return { typeofValue: typeof input }
    const record = input as Record<string, unknown>
    return {
      typeofValue: typeof input,
      constructorName: (input as object)?.constructor?.name,
      keys: typeof input === "object" ? Object.keys(record).slice(0, 20) : undefined,
      type: record.type,
      hasProperties: typeof record.properties,
      hasExtend: typeof record.extend,
      hasDef: typeof record._def,
      hasParse: typeof record.parse,
    }
  } catch (error) {
    return { describeError: String(error) }
  }
}

async function writeStatus(status: Record<string, unknown>) {
  try {
    await mkdir(join(homedir(), ".local", "share", "opencode", "question-async"), { recursive: true })
    await writeFile(STATUS_FILE, JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2))
  } catch {
    // Diagnostics are best-effort; never let them affect setup.
  }
}

export default Plugin.define({
  id: "question-async",
  async setup(ctx) {
    const log = (message: string) => void process.stderr.write(`[question-async] ${message}\n`)
    let calls = 0

    // `ctx.tool.transform` registers this to run on every future tool-list build, not once at setup. Each run gets
    // its own fresh editor reflecting the current state, so the probe and the write both happen here, every time.
    const registration = await ctx.tool.transform((editor) => {
      calls += 1
      let active = false
      let reason = "not probed yet"
      let schemaSeen: Record<string, unknown> = {}

      try {
        const existing = editor.get(QUESTION_TOOL)
        if (!existing) {
          reason = `the "${QUESTION_TOOL}" tool was not found; non-blocking questions are unavailable this build, blocking questions are unaffected`
        } else {
          schemaSeen = describeSchema(existing.input)
          if (!isJsonObjectSchema(existing.input)) {
            reason = `the "${QUESTION_TOOL}" tool's schema isn't a plain JSON object schema; non-blocking questions are unavailable this build, blocking questions are unaffected`
          } else {
            const originalInput = existing.input
            const originalDescription = existing.description
            const originalExecute = existing.execute
            try {
              editor.update(QUESTION_TOOL, (tool) => {
                tool.input = withBlocking(originalInput)
                tool.description = appendBlockingNote(originalDescription)
                tool.execute = createAsyncExecute({
                  original: originalExecute,
                  sessionIDOf: (toolCtx: { sessionID: string }) => toolCtx.sessionID,
                  synthetic: (input) => ctx.session.synthetic({ ...input, delivery: "queue" }),
                  log,
                })
              })
              const after = editor.get(QUESTION_TOOL)
              if (!hasBlocking(after?.input)) {
                reason = `the update to "${QUESTION_TOOL}" did not take effect; non-blocking questions are unavailable this build, blocking questions are unaffected`
              } else {
                active = true
                reason = "active"
              }
            } catch (error) {
              // Never leave a half-mutated tool in place: put the original back and treat this as a failed probe.
              editor.update(QUESTION_TOOL, (tool) => {
                tool.input = originalInput
                tool.description = originalDescription
                tool.execute = originalExecute
              })
              reason = `updating the "${QUESTION_TOOL}" tool threw: ${String(error)}; reverted, blocking questions are unaffected`
            }
          }
        }
      } catch (error) {
        reason = `probing the "${QUESTION_TOOL}" tool threw: ${String(error)}; non-blocking questions are unavailable this build, blocking questions are unaffected`
      }

      log(`non-blocking override ${active ? "active" : `inactive (${reason})`} (build #${calls})`)
      void writeStatus({ active, reason, schemaSeen, calls })
    })

    return () => void registration.dispose()
  },
})
