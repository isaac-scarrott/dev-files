import { existsSync } from "node:fs";
import { Plugin } from "@opencode/plugin";
import { createKillGuard, pgrep } from "./guard.js";
import { acquire } from "./ledger.js";
import { createLog, logField } from "./log.js";
import { OFF_FILE, parseOptions } from "./options.js";
import { readPs } from "./ps.js";
import { apply } from "./reaper.js";
import { Reporter, runawayNotice } from "./report.js";
import { SessionProcs } from "./rpc.js";
import { decide, evaluateRunaway } from "./rules.js";
/** Set by the monitor plugin: the groups it runs, so a monitor's command is never mistaken for a shell's. */
const MONITOR_ACTIVE = Symbol.for("opencode.monitor.active");
const SHELL_TOOL = "shell";
const EVENT_WINDOW_MS = 10_000;
const EVENT_CAP = 2000;
/** The monitor plugin's live query, when it is loaded. Absent means "assume a monitor is running" for the idle rules. */
function activeMonitors() {
    const query = globalThis[MONITOR_ACTIVE];
    if (typeof query !== "function")
        return undefined;
    try {
        const list = query();
        if (!Array.isArray(list))
            return undefined;
        return list.filter((item) => typeof item === "object" && item !== null && typeof item.sessionID === "string" && Number.isInteger(item.pgid));
    }
    catch {
        return undefined;
    }
}
/** The host's mark that a shell call left the foreground. 2.3.0 puts it in `result.output`; 2.2.x in `result.metadata`. */
export function backgroundShellID(result) {
    const object = (value) => (typeof value === "object" && value !== null ? value : undefined);
    const output = object(object(result)?.output);
    if (typeof output?.shellID === "string")
        return output.shellID;
    const metadata = object(object(result)?.metadata);
    if (metadata?.status === "running" && typeof metadata.shellID === "string")
        return metadata.shellID;
    return undefined;
}
/**
 * The host's timestamps are Effect `DateTime.Utc` values, whose milliseconds live on `epochMilliseconds`; a plain number
 * or a Date is accepted too, and anything else is unknown.
 */
export const timestampMs = (value) => {
    if (value instanceof Date)
        return value.getTime();
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "object" && value !== null) {
        const millis = value.epochMilliseconds;
        if (typeof millis === "number" && Number.isFinite(millis))
            return millis;
    }
    return undefined;
};
export default Plugin.define({
    id: "session-procs",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const log = createLog(options.dir, () => Date.now());
        const ps = readPs();
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
        const notify = (notice) => void control?.events
            .emit("notify", { kind: "info", title: notice.title, body: notice.body, key: notice.key, severity: "warning", at: Date.now(), ...(notice.session ? { target: { session: notice.session } } : {}) })
            .catch((error) => log({ event: "notify-failed", error: String(error) }));
        /** `undefined` means the host could not be asked; that is not a reason to kill, so the rules leave it alone. */
        const unknown = new Set();
        const seenFacts = new Set();
        const facts = async (sessionID) => {
            try {
                const info = await ctx.session.get({ sessionID: sessionID });
                const busy = timestampMs(info?.time?.busy);
                const idle = timestampMs(info?.time?.idle);
                const found = {
                    exists: true,
                    archived: Boolean(info?.time?.archived),
                    ...(typeof info?.parentID === "string" ? { parentID: info.parentID } : {}),
                    busy: busy !== undefined && (idle === undefined || busy > idle),
                    ...(idle === undefined ? {} : { idleAt: idle }),
                    ...(typeof info?.location?.directory === "string" ? { location: info.location.directory } : {}),
                };
                // One line per session when it first has a tracked group: enough to explain every later decision for it.
                if (!seenFacts.has(sessionID)) {
                    seenFacts.add(sessionID);
                    log({ event: "session", sessionID, location: ctx.location.directory, ...found, busyAt: busy });
                }
                return found;
            }
            catch (error) {
                if (!unknown.has(sessionID)) {
                    unknown.add(sessionID);
                    log({ event: "session-unknown", sessionID, location: ctx.location.directory, error: String(error) });
                }
                return undefined;
            }
        };
        /** This instance's own delivery; a notice goes through the instance of the session's location (see `route`). */
        const deliverOwn = async (sessionID, text) => {
            await ctx.session.synthetic({ sessionID: sessionID, text, description: "A process this session started was ended", delivery: "steer", resume: false });
        };
        /** The instance whose directory is the session's if it is live, then the rest: the host answers per location. */
        const ordered = (location) => {
            const peers = [...shared.peers.values()];
            return [...new Set([...peers.filter((peer) => location !== undefined && peer.location === location), ...peers])];
        };
        const route = async (sessionID, text) => {
            let last;
            for (const peer of ordered(shared.sessions.get(sessionID)?.location)) {
                try {
                    await peer.deliver(sessionID, text);
                    return;
                }
                catch (error) {
                    last = error;
                }
            }
            throw last ?? new Error("no plugin instance is loaded to deliver the notice");
        };
        const reporter = new Reporter({ now: () => Date.now(), log, notify, deliver: route });
        const ledgerDeps = { store, ps, now: () => Date.now(), log, options, servicePid: process.pid, uid: process.getuid?.() ?? -1 };
        /** Asks this instance first when the group's directory is ours, then every other instance: `session.get` is answered by an instance of the session's location. */
        const ask = async (sessionID, cwd) => {
            const peers = ordered(cwd);
            for (const peer of peers) {
                const found = await peer.facts(sessionID);
                if (found !== undefined)
                    return found;
            }
            return undefined;
        };
        const { shared, release } = acquire(ledgerDeps, { location: ctx.location.directory, facts, deliver: deliverOwn });
        const ledger = shared.ledger;
        const reapDeps = {
            ps,
            kill: (pid, signal) => {
                try {
                    process.kill(pid, signal);
                }
                catch (error) {
                    // ESRCH is the expected answer for a process that died between the snapshot and the signal.
                    if (error.code !== "ESRCH")
                        log({ event: "kill-failed", pid, signal, error: String(error) });
                }
            },
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            log,
            uid: ledgerDeps.uid,
            servicePid: ledgerDeps.servicePid,
            selfPid: process.pid,
            graceMs: options.killGraceSeconds * 1000,
            monitorGroups: () => {
                const monitors = activeMonitors();
                return monitors === undefined ? undefined : new Set(monitors.map((monitor) => monitor.pgid));
            },
        };
        /** A command is logged as one bounded line: it is data and may come from anywhere. */
        const action = (entry) => ({ ...entry, ...(typeof entry.command === "string" ? { command: logField(entry.command) } : {}) });
        /** One reap, dry or real. The reaper re-reads the process table immediately before any signal. */
        const execute = (decision, procs, report) => apply(decision, procs, report, { dryRun: options.dryRun, now: () => Date.now(), log, reap: reapDeps, ledger, reporter });
        const procsOf = (view) => [...view.members, ...view.escapees];
        /** One pass: re-read the table, report runaways, decide, reap, deliver. */
        const scan = async () => {
            const mode = !options.enabled ? "disabled" : existsSync(OFF_FILE) ? `off (${OFF_FILE} exists)` : undefined;
            if (mode !== undefined) {
                if (shared.quiet !== mode)
                    log({ event: "quiet", mode });
                shared.quiet = mode;
                return;
            }
            if (shared.quiet !== undefined) {
                log({ event: "active" });
                shared.quiet = undefined;
            }
            const snapshot = await ps();
            const monitors = activeMonitors();
            const views = await ledger.sync(snapshot);
            if (views.length === 0) {
                await reporter.flush();
                return;
            }
            const sessions = new Map();
            for (const sessionID of new Set(views.map((view) => view.group.sessionID))) {
                const cwd = views.find((view) => view.group.sessionID === sessionID)?.group.cwd;
                sessions.set(sessionID, await ask(sessionID, cwd));
            }
            const now = Date.now();
            for (const view of views) {
                const next = evaluateRunaway(ledger.runaway(view), view.cpu, options.runawayCpu, options.runawayMinutes, now);
                ledger.setRunaway(view.group.pgid, next.state);
                if (!next.report)
                    continue;
                const { text, notice } = runawayNotice(view, options.runawayCpu, options.runawayMinutes, now);
                log(action({ event: "runaway", pgid: view.group.pgid, cpu: Math.round(view.cpu), sessionID: view.group.sessionID, text }));
                reporter.queue(view.group.sessionID, text, notice);
            }
            const byPgid = new Map(views.map((view) => [view.group.pgid, view]));
            const decisions = decide({
                views,
                sessions,
                monitors: monitors === undefined ? undefined : new Set(monitors.map((monitor) => monitor.sessionID)),
                now,
                options,
                runawaySince: (pgid) => {
                    const view = byPgid.get(pgid);
                    return view === undefined ? undefined : ledger.runaway(view).since;
                },
            });
            for (const decision of decisions) {
                const view = byPgid.get(decision.group.pgid);
                if (view)
                    await execute(decision, procsOf(view), true);
            }
            await reporter.flush();
        };
        const exclusive = (run) => {
            const next = shared.chain.then(run, run);
            shared.chain = next.catch(() => { });
            return next;
        };
        /** Every instance hears every event; the first to claim one acts, the rest see it taken. */
        const claim = (key) => {
            const now = Date.now();
            if (shared.events.size > EVENT_CAP) {
                for (const [old, at] of shared.events)
                    if (now - at > EVENT_WINDOW_MS)
                        shared.events.delete(old);
                if (shared.events.size > EVENT_CAP)
                    shared.events.clear();
            }
            const seen = shared.events.get(key);
            if (seen !== undefined && now - seen < EVENT_WINDOW_MS)
                return false;
            shared.events.set(key, now);
            return true;
        };
        /** Archived or deleted: every group of that session goes now, live background jobs included. */
        const sessionEnd = (sessionID, reason) => exclusive(async () => {
            const snapshot = await ps();
            const views = (await ledger.sync(snapshot)).filter((view) => view.group.sessionID === sessionID);
            if (views.length === 0)
                return;
            const end = { exists: reason !== "deleted", archived: true, busy: false };
            const decisions = decide({ views, sessions: new Map([[sessionID, end]]), monitors: undefined, now: Date.now(), options, runawaySince: () => undefined });
            for (const decision of decisions) {
                const view = views.find((candidate) => candidate.group.pgid === decision.group.pgid);
                // A deleted session has nobody to tell; an archived one still gets its notice when it comes back.
                if (view)
                    await execute(decision, procsOf(view), reason !== "deleted");
            }
            await reporter.flush(sessionID);
        });
        // The kill guard: a pattern that reaches past this session's own processes is refused before it runs.
        const guard = createKillGuard({
            pgrep,
            snapshot: () => ps().catch(() => undefined),
            tracked: (sessionID, snapshot) => ledger.trackedPids(sessionID, snapshot),
            log,
        });
        await ctx.tool.hook("execute.before", async (event) => {
            if (!options.enabled || !options.guardKill || existsSync(OFF_FILE))
                return;
            await guard(event);
        });
        // The background mark: a shell call that returned with the job still running is a background job.
        await ctx.tool.hook("execute.after", (event) => {
            if (event.tool !== SHELL_TOOL || event.status !== "completed")
                return;
            const shellID = backgroundShellID(event.result);
            if (shellID)
                ledger.markBackground(shellID);
        });
        control = await ctx.rpc.register(SessionProcs, {});
        const abort = new AbortController();
        const listen = async () => {
            while (!abort.signal.aborted) {
                try {
                    for await (const event of ctx.event.subscribe({ types: ["shell.created", "shell.exited", "shell.deleted", "session.archived", "session.deleted"], signal: abort.signal })) {
                        if (event.type === "shell.created") {
                            const info = event.data.info;
                            if (!claim(`created:${info.id}`))
                                continue;
                            const sessionID = info.metadata?.sessionID;
                            const created = {
                                shellID: info.id,
                                sessionID: typeof sessionID === "string" ? sessionID : undefined,
                                command: info.command,
                                cwd: info.cwd,
                                shell: info.shell,
                                started: info.time.started,
                                ...(typeof info.pid === "number" ? { pid: info.pid } : {}),
                            };
                            await exclusive(() => ledger.adopt(created, reapDeps.monitorGroups() ?? new Set()));
                        }
                        else if (event.type === "shell.exited" || event.type === "shell.deleted") {
                            if (!claim(`${event.type}:${event.data.id}`))
                                continue;
                            ledger.exit(event.data.id, event.type === "shell.exited" ? String(event.data.status) : "deleted");
                        }
                        else {
                            const sessionID = event.data.sessionID;
                            if (!claim(`${event.type}:${sessionID}`))
                                continue;
                            await sessionEnd(sessionID, event.type === "session.archived" ? "archived" : "deleted");
                            if (event.type === "session.deleted")
                                reporter.forget(sessionID);
                        }
                    }
                }
                catch (error) {
                    if (abort.signal.aborted)
                        return;
                    log({ event: "event-stream-ended", error: String(error) });
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        };
        void listen();
        // One scan loop for the whole process, held by the shared ledger, not one per plugin instance. A reload hands it to
        // the new instance (setup is called before the old instance's dispose); a loop that was superseded stops re-arming.
        const token = Symbol("scan");
        shared.tick = token;
        const tick = async () => {
            shared.timer = undefined;
            if (shared.refs === 0 || shared.tick !== token)
                return;
            if (!shared.restored) {
                shared.restored = true;
                const kept = await ledger.restore().catch((error) => {
                    log({ event: "restore-failed", error: String(error) });
                    return 0;
                });
                log({ event: "restored", groups: kept });
            }
            await exclusive(scan).catch((error) => log({ event: "scan-failed", error: String(error) }));
            if (shared.refs === 0 || shared.tick !== token)
                return;
            shared.timer = setTimeout(() => void tick(), options.scanSeconds * 1000);
            shared.timer.unref?.();
        };
        if (shared.timer !== undefined)
            clearTimeout(shared.timer);
        shared.timer = setTimeout(() => void tick(), 0);
        log({ event: "loaded", location: ctx.location.directory, dryRun: options.dryRun, scanSeconds: options.scanSeconds });
        return async () => {
            abort.abort();
            const registered = control;
            control = undefined;
            await registered?.dispose();
            release();
        };
    },
});
