import { Plugin } from "@opencode/plugin"
import { system } from "./instructions.js"

/** The host registers its tools under the `opencode` namespace: `opencode_artifact_create`. */
const creates = /(?:^|[._])artifact_create$/

/**
 * The server half is one hook: it tells the agent how to use the host's artifact tools for visual replies. The pages,
 * their storage and their lifetime belong to the host (`experimental.artifacts`); the GUI half renders them.
 */
export default Plugin.define({
  id: "visual-replies",
  async setup(ctx) {
    const hook = await ctx.session.hook("context", async (event) => {
      // Without `experimental.artifacts` the tools do not exist and the prompt would describe nothing.
      const tools = await ctx.tool.list()
      if (!tools.some((tool) => creates.test(tool.id))) return
      event.system.push({ type: "text", text: system })
    })
    return () => hook.dispose()
  },
})
