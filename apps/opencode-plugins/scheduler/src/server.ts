import { Plugin } from "@opencode/plugin"
import { createLog } from "./diag.js"
import { acquire } from "./hub.js"
import { parseOptions } from "./options.js"
import { registerTools } from "./tools.js"

const clock = { now: () => Date.now() }

export default Plugin.define({
  id: "scheduler",
  async setup(ctx) {
    const options = parseOptions(ctx.options)
    const log = createLog(options.logDir, clock.now)
    const { hub, release } = await acquire(ctx, options, clock, log)
    const tools = await ctx.tool.transform((editor) => registerTools(editor, ctx, hub, options))
    return async () => {
      await tools.dispose()
      release()
    }
  },
})
