import { Plugin } from "@opencode/plugin"
import { appendBlockingNote, createAsyncExecute, hasBlocking, isJsonObjectSchema, withBlocking } from "./override.js"

const QUESTION_TOOL = "question"

export default Plugin.define({
  id: "question-async",
  async setup(ctx) {
    const log = (message: string) => void process.stderr.write(`[question-async] ${message}\n`)
    let active = false
    let reason = "not probed yet"

    try {
      await ctx.tool.transform((editor) => {
        const existing = editor.get(QUESTION_TOOL)
        if (!existing) {
          reason = `the "${QUESTION_TOOL}" tool was not found; non-blocking questions are unavailable this session, blocking questions are unaffected`
          return
        }
        if (!isJsonObjectSchema(existing.input)) {
          reason = `the "${QUESTION_TOOL}" tool's schema isn't a plain JSON object schema; non-blocking questions are unavailable this session, blocking questions are unaffected`
          return
        }

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
        } catch (error) {
          // Never leave a half-mutated tool in place: put the original back and treat this as a failed probe.
          editor.update(QUESTION_TOOL, (tool) => {
            tool.input = originalInput
            tool.description = originalDescription
            tool.execute = originalExecute
          })
          reason = `updating the "${QUESTION_TOOL}" tool threw: ${String(error)}; reverted, blocking questions are unaffected`
          return
        }

        const after = editor.get(QUESTION_TOOL)
        if (!hasBlocking(after?.input)) {
          reason = `the update to "${QUESTION_TOOL}" did not take effect; non-blocking questions are unavailable this session, blocking questions are unaffected`
          return
        }
        active = true
        reason = "active"
      })
    } catch (error) {
      reason = `probing the "${QUESTION_TOOL}" tool threw: ${String(error)}; non-blocking questions are unavailable this session, blocking questions are unaffected`
    }

    log(`non-blocking override ${active ? "active" : `inactive (${reason})`}`)
  },
})
