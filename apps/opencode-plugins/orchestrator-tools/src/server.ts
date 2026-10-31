import { Plugin } from "@opencode/plugin"
import { CODE_MODE_TOOL, INSTRUCTIONS, TOOL_PREFIX } from "./instructions.js"
import { parseOptions } from "./options.js"
import { Orchestrator } from "./orchestrator.js"
import { registerTools } from "./tools.js"

export default Plugin.define({
  id: "orchestrator-tools",
  async setup(ctx) {
    const options = parseOptions(ctx.options)
    const orchestrator = new Orchestrator(ctx, options)
    const tools = await ctx.tool.transform((editor) => registerTools(editor, orchestrator, options))
    // Code Mode folds the tools into `execute`, so the request's tool map shows no orchestrate_* id then.
    const hook = await ctx.session.hook("context", (event) => {
      const ids = Object.keys(event.tools)
      if (!ids.some((id) => id.startsWith(TOOL_PREFIX) || id === CODE_MODE_TOOL)) return
      event.system.push({ type: "text", text: INSTRUCTIONS })
    })
    return async () => {
      await hook.dispose()
      await tools.dispose()
    }
  },
})
