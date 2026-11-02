import { Plugin } from "@opencode/plugin";
import { createLog } from "./diag.js";
import { scheduleControl } from "./control.js";
import { acquire } from "./hub.js";
import { parseOptions } from "./options.js";
import { ScheduleControl } from "./rpc.js";
import { registerTools } from "./tools.js";
const clock = { now: () => Date.now() };
export default Plugin.define({
    id: "scheduler",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const log = createLog(options.logDir, clock.now);
        const { hub, release } = await acquire(ctx, options, clock, log);
        const tools = await ctx.tool.transform((editor) => registerTools(editor, ctx, hub, options));
        // The desktop row's Cancel button.
        const handlers = scheduleControl(hub);
        const control = await ctx.rpc.register(ScheduleControl, {
            active: (input) => handlers.active(input),
            cancel: (input) => handlers.cancel(input),
        });
        return async () => {
            await control.dispose();
            await tools.dispose();
            release();
        };
    },
});
//# sourceMappingURL=server.js.map