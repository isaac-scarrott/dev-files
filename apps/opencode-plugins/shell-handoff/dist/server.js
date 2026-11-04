import { Plugin } from "@opencode/plugin";
import { bootId, bootStart } from "./boot.js";
import { diskFiles } from "./files.js";
import { parseOptions } from "./options.js";
import { ShellHandoff } from "./rpc.js";
import { Tracker } from "./tracker.js";
export default Plugin.define({
    id: "shell-handoff",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const log = (message) => void process.stderr.write(`[shell-handoff] ${message}\n`);
        const store = {
            get: (key) => ctx.storage.get(key),
            set: (key, value) => ctx.storage.set(key, value),
            remove: (key) => ctx.storage.remove(key),
            scan: async (prefix) => {
                const found = [];
                let after;
                do {
                    const page = await ctx.storage.scan({ prefix, after, limit: 100 });
                    found.push(...page.entries.map((entry) => ({ key: entry.key, value: entry.value })));
                    after = page.next;
                } while (after);
                return found;
            },
        };
        let control;
        const notify = (notice) => {
            if (!options.notify)
                return;
            void control?.events
                .emit("notify", {
                kind: "info",
                title: notice.title,
                body: notice.body,
                key: notice.key,
                severity: "warning",
                at: Date.now(),
                ...(notice.session ? { target: { session: notice.session } } : {}),
            })
                .catch((error) => log(`could not send a notification: ${String(error)}`));
        };
        const tracker = new Tracker({
            options,
            boot: bootId(),
            location: ctx.location.directory,
            now: Date.now,
            restartedAt: () => bootStart(bootId()) ?? Date.now(),
            store,
            files: diskFiles(options.dir),
            host: {
                sessionExists: async (sessionID) => Boolean(await ctx.session.get({ sessionID: sessionID }).catch(() => undefined)),
                synthetic: async (sessionID, text) => {
                    await ctx.session.synthetic({ sessionID: sessionID, text, description: "Background shell jobs lost to a restart", delivery: "steer", resume: false });
                },
                alive: (pid) => {
                    try {
                        process.kill(pid, 0);
                        return true;
                    }
                    catch (error) {
                        return error.code === "EPERM";
                    }
                },
            },
            notify,
            later: (run, ms) => {
                const timer = setTimeout(run, ms);
                timer.unref();
                return () => clearTimeout(timer);
            },
            log,
        });
        // Before anything is recorded: the first call tells jobs of an earlier service process from this one's.
        control = await ctx.rpc.register(ShellHandoff, {});
        await ctx.tool.hook("execute.after", (event) => {
            if (event.tool !== "shell")
                return;
            return tracker.toolEnd({
                tool: event.tool,
                sessionID: event.sessionID,
                messageID: event.messageID,
                callID: event.id,
                input: event.input,
                status: event.status,
                result: event.status === "completed" ? event.result : undefined,
            });
        });
        // Optional extras: the host may not offer a hook; the record still works without it.
        await ctx.session
            .hook("experimental.idle", (event) => {
            tracker.idle(event.sessionID, new Set(event.background.flatMap((job) => (job.kind === "shell" ? [job.shellID] : []))));
        })
            .catch((error) => log(`no idle hook: ${String(error)}`));
        const abort = new AbortController();
        const listen = async () => {
            while (!abort.signal.aborted) {
                try {
                    for await (const event of ctx.event.subscribe({
                        types: ["shell.created", "shell.exited", "shell.deleted", "session.deleted", "session.archived", "session.execution.started"],
                        signal: abort.signal,
                    })) {
                        switch (event.type) {
                            case "shell.created": {
                                const info = event.data.info;
                                const sessionID = info.metadata?.sessionID;
                                tracker.created({ id: info.id, command: info.command, cwd: info.cwd, pid: info.pid, file: info.file, sessionID: typeof sessionID === "string" ? sessionID : undefined, started: info.time.started });
                                break;
                            }
                            case "shell.exited":
                                tracker.ended(event.data.id, event.data.status);
                                break;
                            case "shell.deleted":
                                tracker.ended(event.data.id);
                                break;
                            case "session.deleted":
                            case "session.archived":
                                tracker.removeSession(event.data.sessionID);
                                break;
                            case "session.execution.started":
                                if (tracker.hasPending(event.data.sessionID))
                                    await tracker.flush(event.data.sessionID);
                                break;
                        }
                    }
                }
                catch (error) {
                    if (abort.signal.aborted)
                        return;
                    log(`event stream ended: ${String(error)}`);
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        };
        void listen();
        // Last: what restore announces (the notification) goes through the control registered above.
        await tracker.restore();
        log(`loaded for ${ctx.location.directory}; boot ${bootId()}; ${tracker.jobs.size} recorded job(s)`);
        return async () => {
            abort.abort();
            tracker.dispose();
            const registered = control;
            control = undefined;
            await registered?.dispose();
        };
    },
});
