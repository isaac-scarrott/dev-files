import { Monitor } from "./monitor.js";
import { oneLine } from "./diag.js";
import { renderWake } from "./wrap.js";
const PREFIX = "monitor/def/";
const randomID = () => `mon_${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}`;
export class Monitors {
    deps;
    running = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    get count() {
        return this.running.size;
    }
    async start(input) {
        const { options, clock } = this.deps;
        if (this.running.size >= options.maxMonitors)
            throw new Error(`${this.running.size} monitors are running; maxMonitors is ${options.maxMonitors}. Stop one with stop_monitor first.`);
        let id = (this.deps.newID ?? randomID)();
        while (this.running.has(id))
            id = (this.deps.newID ?? randomID)();
        const now = clock.now();
        const def = {
            id,
            name: input.name?.trim() || oneLine(input.command, 40),
            command: input.command,
            cwd: input.cwd,
            sessionID: input.sessionID,
            match: input.match,
            batchSeconds: input.batchSeconds,
            maxEvents: input.maxEvents,
            rearmMinutes: input.rearmMinutes,
            createdAt: now,
            origin: this.deps.origin,
            expiresAt: now + input.ttlMinutes * 60_000,
        };
        const monitor = this.create(def);
        await this.deps.store.set(PREFIX + id, JSON.parse(JSON.stringify(def)));
        this.deps.log(`${id} (${def.name}): started for ${def.sessionID} in ${def.cwd}: ${oneLine(def.command)}`);
        monitor.start();
        return this.describe(monitor);
    }
    list() {
        return [...this.running.values()].map((monitor) => this.describe(monitor));
    }
    async stop(id) {
        const monitor = this.running.get(id);
        if (!monitor)
            return undefined;
        const info = this.describe(monitor);
        await monitor.stop("stopped by request");
        return info;
    }
    /** The session was archived or deleted: its monitors have no one to wake. */
    async removeSession(sessionID) {
        const mine = [...this.running.values()].filter((monitor) => monitor.def.sessionID === sessionID);
        await Promise.all(mine.map((monitor) => monitor.stop(`session ${sessionID} was archived or deleted`)));
    }
    /**
     * Monitors from a previous run. Only those with a re-arm schedule come back, and the first wake says so. The rest are
     * forgotten, because a command nobody asked for in this run must not start by itself, and their session is told once
     * that they are gone.
     */
    async restore() {
        const { store, clock, log, sessions, options } = this.deps;
        const now = clock.now();
        for (const { key, value } of await store.scan(PREFIX)) {
            const def = value;
            if (def.origin !== this.deps.origin)
                continue;
            const active = (await sessions.state(def.sessionID)) === "active";
            const forget = async (why, notify) => {
                log(`${def.id} (${def.name}): not restored: ${why}`);
                // Removed before the wake, so a failed or repeated restart cannot announce it twice.
                await store.remove(key);
                if (notify && active)
                    await this.announceLost(def);
            };
            if (def.rearmMinutes === undefined) {
                await forget("no re-arm schedule, so it does not survive a restart", true);
            }
            else if (def.expiresAt <= now) {
                await forget("its time limit passed", true);
            }
            else if (!active) {
                await forget(`session ${def.sessionID} is gone or archived`, false);
            }
            else if (this.running.size >= options.maxMonitors) {
                await forget(`maxMonitors ${options.maxMonitors} reached`, true);
            }
            else {
                const monitor = this.create(def);
                log(`${def.id} (${def.name}): restored after a restart`);
                monitor.start("This monitor was restarted automatically after OpenCode restarted. Output produced while it was down was not seen.");
            }
        }
    }
    async announceLost(def) {
        const text = renderWake({
            name: def.name,
            id: def.id,
            seq: 1,
            lines: [],
            dropped: 0,
            notes: [`Monitor gone: OpenCode restarted and this monitor was lost with it. It is no longer running and will not send anything more. Start it again with the monitor tool if you still need it.`],
        });
        try {
            await this.deps.sessions.prompt(def.sessionID, text, { monitorID: def.id, seq: 1 });
        }
        catch (error) {
            this.deps.log(`${def.id} (${def.name}): could not tell ${def.sessionID} it is gone: ${String(error)}`);
        }
    }
    async dispose() {
        await Promise.all([...this.running.values()].map((monitor) => monitor.dispose()));
        this.running.clear();
    }
    create(def) {
        const { options, clock, spawn, sessions, log, store } = this.deps;
        const monitor = new Monitor(def, {
            options,
            clock,
            spawn,
            log,
            deliver: (sessionID, text, meta) => sessions.prompt(sessionID, text, meta),
            finished: (done) => {
                if (this.running.get(done.def.id) === done)
                    this.running.delete(done.def.id);
                void store.remove(PREFIX + done.def.id).catch(() => { });
            },
        });
        this.running.set(def.id, monitor);
        return monitor;
    }
    describe(monitor) {
        const { def } = monitor;
        const iso = (ms) => new Date(ms).toISOString();
        const next = monitor.nextRunAt();
        return {
            id: def.id,
            name: def.name,
            command: def.command,
            cwd: def.cwd,
            session: def.sessionID,
            state: monitor.paused ? "paused" : monitor.state,
            runningSince: iso(monitor.startedAt),
            events: monitor.events,
            lastEvent: monitor.lastEventAt === undefined ? null : iso(monitor.lastEventAt),
            expiresAt: iso(def.expiresAt),
            ...(def.rearmMinutes === undefined ? {} : { rearmMinutes: def.rearmMinutes }),
            ...(next === undefined ? {} : { nextRunAt: iso(next) }),
            ...(monitor.paused ? { paused: true } : {}),
        };
    }
}
//# sourceMappingURL=manager.js.map