import { Plugin } from "@opencode/plugin";
import { modelMatches, parseOptions } from "./options.js";
import { HandoffNudge } from "./rpc.js";
import { Watcher } from "./watcher.js";
const EVENTS = [
    "session.step.ended",
    "session.execution.succeeded",
    "session.execution.failed",
    "session.execution.interrupted",
    "session.deleted",
];
const RESUBSCRIBE_MS = 5_000;
const log = (message) => console.log(`handoff-nudge: ${message}`);
export default Plugin.define({
    id: "handoff-nudge",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const watcher = new Watcher(ctx, options, { now: () => Date.now() }, ctx.location.directory, log);
        const abort = new AbortController();
        log(`loaded for ${ctx.location.directory}: models ${options.models.join(", ")}; tiers ${options.tiers.join(", ")}; cold write ${options.coldWrite}`);
        const rpc = await ctx.rpc.register(HandoffNudge, {
            get: async (input) => {
                const { sessionID } = input;
                const info = await ctx.session.get({ sessionID }).catch(() => undefined);
                if (!info || info.parentID !== undefined || !modelMatches(info.model?.id, options.models)) {
                    return { available: false, context: 0, tier: 0, dismissed: 0 };
                }
                const watch = await watcher.read(sessionID);
                return { available: true, context: watch?.context ?? 0, tier: watch?.tier ?? 0, dismissed: watch?.dismissed ?? 0 };
            },
            handoff: async (input) => {
                const { sessionID } = input;
                return { queued: await watcher.handoff(sessionID) };
            },
            dismiss: async (input) => {
                const { sessionID } = input;
                return { dismissed: await watcher.dismiss(sessionID) };
            },
        });
        watcher.changed = (sessionID) => void rpc.events.emit("changed", { sessionID }).catch((error) => log(`changed event failed: ${String(error)}`));
        watcher.tell = (notification) => void rpc.events
            .emit("notify", {
            kind: "info",
            title: notification.title,
            body: notification.body,
            key: notification.key,
            target: { session: notification.sessionID },
            at: Date.now(),
        })
            .catch((error) => log(`could not send a notification: ${String(error)}`));
        const listen = async () => {
            while (!abort.signal.aborted) {
                try {
                    for await (const event of ctx.event.subscribe({ types: [...EVENTS], signal: abort.signal })) {
                        const sessionID = event.data.sessionID;
                        switch (event.type) {
                            case "session.step.ended":
                                await watcher.onStep(sessionID, event.data.tokens);
                                break;
                            case "session.deleted":
                                await watcher.forget(sessionID);
                                break;
                            default:
                                await watcher.onTurnEnd(sessionID);
                                break;
                        }
                    }
                }
                catch (error) {
                    if (abort.signal.aborted)
                        return;
                    log(`event stream ended: ${String(error)}`);
                }
                await new Promise((resolve) => setTimeout(resolve, RESUBSCRIBE_MS));
            }
        };
        void listen();
        return async () => {
            abort.abort();
            await rpc.dispose();
        };
    },
});
//# sourceMappingURL=server.js.map