import { Plugin } from "@opencode/plugin";
import { INSTRUCTIONS, TOOL_PREFIX } from "./instructions.js";
import { parseOptions } from "./options.js";
import { Orchestrator } from "./orchestrator.js";
import { registerTools } from "./tools.js";
export default Plugin.define({
    id: "orchestrator-tools",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const orchestrator = new Orchestrator(ctx, options);
        const tools = await ctx.tool.transform((editor) => registerTools(editor, orchestrator, options));
        const hook = await ctx.session.hook("context", (event) => {
            if (!Object.keys(event.tools).some((id) => id.startsWith(TOOL_PREFIX)))
                return;
            event.system.push({ type: "text", text: INSTRUCTIONS });
        });
        return async () => {
            await hook.dispose();
            await tools.dispose();
        };
    },
});
//# sourceMappingURL=server.js.map