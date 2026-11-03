import { Plugin } from "@opencode/plugin";
import { detectUsageLimit } from "./detect.js";
import { createLog, oneLine, Samples } from "./diag.js";
import { parseOptions } from "./options.js";
import { acquireUsage } from "./hub.js";
import { Resumer } from "./resume.js";
import { UsageResume } from "./rpc.js";
import { Toggles } from "./toggles.js";
const EVENTS = [
    "session.created",
    "session.execution.failed",
    "session.execution.started",
    "session.execution.succeeded",
    "session.execution.interrupted",
    "session.deleted",
    "session.inbox.enqueued",
];
const RESUBSCRIBE_MS = 5_000;
const clock = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
export default Plugin.define({
    id: "usage-resume",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const log = createLog(options.sampleDir, () => clock.now());
        const toggles = new Toggles(ctx.storage, () => clock.now());
        const samples = new Samples({ dir: options.sampleDir, now: () => clock.now(), log });
        const usage = acquireUsage(ctx.storage, {
            now: () => clock.now(),
            random: Math.random,
            fetch,
            authDir: options.authDir,
            snapshotPath: options.snapshotPath,
        });
        const resumer = await Resumer.create(ctx, options, clock, await usage.source, toggles, samples, ctx.location.directory, log);
        const abort = new AbortController();
        const defaults = await toggles.default();
        log(`loaded for ${ctx.location.directory}: auto-resume is opt-in per session (global default ${defaults.enabled ? "on" : "off"}); ${resumer.waiting().length} session(s) waiting; samples and usage-resume.log in ${options.sampleDir}`);
        const rpc = await ctx.rpc.register(UsageResume, {
            get: async (input) => {
                const { sessionID } = input;
                const info = await ctx.session.get({ sessionID }).catch(() => undefined);
                if (!info || info.parentID !== undefined)
                    return { enabled: false, available: false, limited: false };
                const state = await toggles.effective(sessionID, true, info.time.created);
                const limited = await resumer.limited(sessionID);
                return { enabled: state.on, available: true, limited: limited !== undefined, ...(limited?.resumesAt !== undefined && state.on ? { resumesAt: limited.resumesAt } : {}) };
            },
            set: async (input) => {
                const { sessionID, enabled } = input;
                const info = await ctx.session.get({ sessionID }).catch(() => undefined);
                if (!info || info.parentID !== undefined)
                    return { enabled: false };
                await toggles.set(sessionID, enabled);
                await resumer.reconcile(sessionID);
                log(`${sessionID}: auto-resume turned ${enabled ? "on" : "off"} for this session`);
                await rpc.events.emit("changed", { sessionID });
                return { enabled };
            },
            getDefault: async () => ({ enabled: (await toggles.default()).enabled }),
            setDefault: async (input) => {
                const { enabled } = input;
                await toggles.setDefault(enabled);
                log(`global default for new sessions turned ${enabled ? "on" : "off"}`);
                await rpc.events.emit("changed", {});
                return { enabled };
            },
        });
        // OpenCode retries a failed request with backoff; a usage limit lasts hours, so end the run and let us wait.
        // Only for sessions that opted in: an opted-out session keeps OpenCode's own behaviour.
        resumer.changed = (sessionID) => void rpc.events.emit("changed", { sessionID }).catch(() => { });
        resumer.notify = (notification) => void rpc.events.emit("notify", { ...notification }).catch((error) => log(`could not send a notification: ${String(error)}`));
        const retry = await ctx.session.hook("retry", async (event) => {
            const limit = detectUsageLimit(event.error, Date.now());
            log(`${event.sessionID}: retry hook type=${event.error.type ?? "?"} status=${event.error.status ?? "-"} limit=${limit ? "yes" : "no"} message="${oneLine(event.error.message)}"`);
            if (!limit)
                return;
            const info = await ctx.session.get({ sessionID: event.sessionID }).catch(() => undefined);
            if (!info)
                return;
            if (info.parentID === undefined && info.location.directory === ctx.location.directory)
                await resumer.markLimited(event.sessionID, limit, Date.now());
            if ((await toggles.effective(event.sessionID, info.parentID === undefined, info.time.created)).on)
                event.decision = { retry: false };
        });
        const listen = async () => {
            while (!abort.signal.aborted) {
                try {
                    for await (const event of ctx.event.subscribe({ types: [...EVENTS], signal: abort.signal })) {
                        const sessionID = event.data.sessionID;
                        switch (event.type) {
                            case "session.created":
                                if (event.data.parentID === undefined && event.data.location.directory === ctx.location.directory) {
                                    await toggles.seed(sessionID);
                                    log(`${sessionID}: created in ${ctx.location.directory}; auto-resume ${(await toggles.own(sessionID)) ? "on (global default)" : "off"}`);
                                }
                                break;
                            case "session.execution.failed":
                                await resumer.onFailed(sessionID, event.data.error, event.created);
                                break;
                            case "session.execution.succeeded":
                                await resumer.onSettled(sessionID, true);
                                break;
                            case "session.inbox.enqueued":
                                // Our own notices are synthetic; only a person's message means they are back in the session.
                                if (event.data.item.type === "user")
                                    await resumer.onSettled(sessionID);
                                break;
                            case "session.deleted":
                                await resumer.onSettled(sessionID);
                                await toggles.forget(sessionID);
                                break;
                            default:
                                await resumer.onSettled(sessionID);
                        }
                    }
                }
                catch (error) {
                    if (abort.signal.aborted)
                        return;
                    log(`event stream ended: ${String(error)}`);
                }
                await clock.sleep(RESUBSCRIBE_MS);
            }
        };
        void listen();
        void resumer.tick();
        const timer = setInterval(() => void resumer.tick(), options.tickMs);
        return async () => {
            abort.abort();
            clearInterval(timer);
            await retry.dispose();
            await rpc.dispose();
            usage.release();
        };
    },
});
//# sourceMappingURL=server.js.map