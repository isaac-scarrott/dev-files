import { matchShell } from "./match.js";
import { liveProcs } from "./ps.js";
export const LEDGER_PREFIX = "ledger/";
export const SEEN_CAP = 500;
const key = (pgid) => `${LEDGER_PREFIX}${pgid}`;
const str = (value) => (typeof value === "string" && value.length > 0 ? value : undefined);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
export function parseGroup(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const o = value;
    const pgid = num(o.pgid);
    const leaderPid = num(o.leaderPid);
    const leaderStart = num(o.leaderStart);
    const sessionID = str(o.sessionID);
    const shellID = str(o.shellID);
    const startedAt = num(o.startedAt);
    if (pgid === undefined || leaderPid === undefined || leaderStart === undefined || !sessionID || !shellID || startedAt === undefined)
        return undefined;
    const escapees = Array.isArray(o.escapees) ? o.escapees.filter((pid) => typeof pid === "number" && Number.isInteger(pid)) : [];
    return {
        pgid,
        leaderPid,
        leaderStart,
        sessionID,
        shellID,
        background: o.background === true,
        startedAt,
        ...(str(o.cwd) === undefined ? {} : { cwd: str(o.cwd) }),
        ...(num(o.exitedAt) === undefined ? {} : { exitedAt: num(o.exitedAt) }),
        escapees,
    };
}
/**
 * The groups this service owns, keyed by pgid, with what is needed to decide about them. One instance per service
 * process: the plugin loads once per directory, every instance hears every event, and a per-location ledger would adopt
 * the same shell several times and reap it several times.
 */
export class Ledger {
    active;
    groups = new Map();
    runtime = new Map();
    adopting = new Set();
    seen = new Set();
    backgroundShells = new Set();
    constructor(active) {
        this.active = active;
    }
    get deps() {
        return this.active;
    }
    /** A plugin reload builds the module again in the same process: the dependencies come from the newest instance. */
    rebind(deps) {
        this.active = deps;
    }
    get service() {
        return { pid: this.deps.servicePid, uid: this.deps.uid };
    }
    state(pgid) {
        const existing = this.runtime.get(pgid);
        if (existing)
            return existing;
        const created = { cpu: 0, at: this.deps.now(), runaway: { notified: false }, reported: new Set() };
        this.runtime.set(pgid, created);
        return created;
    }
    async save(group) {
        await this.deps.store.set(key(group.pgid), group).catch((error) => this.deps.log({ event: "store-failed", pgid: group.pgid, error: String(error) }));
    }
    /**
     * `shell.created`: take one snapshot, match the shell to its process group, record it. Called from every plugin
     * instance in the process, so the shellID is claimed once and a second claim is a no-op.
     */
    async adopt(created, monitors) {
        if (this.adopting.has(created.shellID) || [...this.groups.values()].some((group) => group.shellID === created.shellID))
            return;
        this.adopting.add(created.shellID);
        this.seen.add(created.shellID);
        while (this.seen.size > SEEN_CAP) {
            const oldest = this.seen.values().next().value;
            if (oldest === undefined)
                break;
            this.seen.delete(oldest);
        }
        try {
            if (!created.sessionID) {
                this.deps.log({ event: "adopt-miss", shellID: created.shellID, reason: "no session id on shell.created" });
                return;
            }
            const snapshot = await this.deps.ps();
            const result = matchShell(created, snapshot, this.service, monitors ?? new Set());
            if (result.state !== "matched") {
                this.deps.log({ event: "adopt-miss", shellID: created.shellID, reason: result.state === "none" ? result.reason : "ambiguous: identical commands started together", ...(result.state === "ambiguous" ? { pids: result.pids } : {}) });
                return;
            }
            const { match } = result;
            if (this.groups.has(match.pgid)) {
                this.deps.log({ event: "adopt-miss", shellID: created.shellID, reason: `group ${match.pgid} is already tracked`, pgid: match.pgid });
                return;
            }
            const group = {
                pgid: match.pgid,
                leaderPid: match.leaderPid,
                leaderStart: match.leaderStart,
                sessionID: created.sessionID,
                shellID: created.shellID,
                background: this.backgroundShells.delete(created.shellID),
                startedAt: created.started,
                ...(created.cwd === undefined ? {} : { cwd: created.cwd }),
                escapees: [],
            };
            this.groups.set(group.pgid, group);
            const leader = snapshot.byPid.get(group.leaderPid);
            this.runtime.set(group.pgid, { cpu: leader?.cpu ?? 0, at: this.deps.now(), runaway: { notified: false }, reported: new Set() });
            await this.save(group);
            this.deps.log({ event: "adopt", pgid: group.pgid, pid: group.leaderPid, sessionID: group.sessionID, shellID: group.shellID, background: group.background, command: created.command });
        }
        finally {
            this.adopting.delete(created.shellID);
        }
    }
    /**
     * The host says the job left the foreground. `execute.after` is heard before `shell.created` (measured), so the mark
     * waits for the adoption; if it arrives after one, the record learns it.
     */
    markBackground(shellID) {
        const group = [...this.groups.values()].find((candidate) => candidate.shellID === shellID);
        if (!group) {
            this.backgroundShells.add(shellID);
            if (this.backgroundShells.size > SEEN_CAP) {
                const oldest = this.backgroundShells.values().next().value;
                if (oldest !== undefined)
                    this.backgroundShells.delete(oldest);
            }
            return;
        }
        if (group.background)
            return;
        group.background = true;
        void this.save(group);
        this.deps.log({ event: "background", pgid: group.pgid, shellID });
    }
    /** `shell.exited` / `shell.deleted`: the leader is gone; whatever is left in the group is a leftover. */
    exit(shellID, reason) {
        const group = [...this.groups.values()].find((candidate) => candidate.shellID === shellID);
        if (!group || group.exitedAt !== undefined)
            return;
        group.exitedAt = this.deps.now();
        void this.save(group);
        this.deps.log({ event: "shell-exited", pgid: group.pgid, shellID, reason });
    }
    /**
     * A restart left the groups in storage and their processes on the machine: adopt back the ones whose processes are
     * still there, with the same uid and a start time at or after the group's, and forget the rest. The leader may be
     * gone (a `&` server outliving its shell), so a single live member is enough.
     */
    async restore() {
        const entries = await this.deps.store.scan(LEDGER_PREFIX).catch(() => []);
        if (entries.length === 0)
            return 0;
        const snapshot = await this.deps.ps().catch(() => undefined);
        let kept = 0;
        for (const entry of entries) {
            const group = parseGroup(entry.value);
            if (!group || key(group.pgid) !== entry.key || snapshot === undefined || group.startedAt > this.deps.now() + 60_000) {
                await this.deps.store.remove(entry.key).catch(() => { });
                continue;
            }
            const members = liveProcs(snapshot, group.pgid, group.startedAt, this.deps.uid, group.escapees);
            if (members.length === 0) {
                await this.deps.store.remove(entry.key).catch(() => { });
                this.deps.log({ event: "restore-gone", pgid: group.pgid, shellID: group.shellID });
                continue;
            }
            const leader = snapshot.byPid.get(group.leaderPid);
            const leaderAlive = leader !== undefined && !leader.zombie && leader.pgid === group.pgid && leader.start === group.leaderStart;
            group.escapees = group.escapees.filter((pid) => snapshot.byPid.has(pid));
            if (!leaderAlive && group.exitedAt === undefined)
                group.exitedAt = this.deps.now();
            this.groups.set(group.pgid, group);
            this.runtime.set(group.pgid, { cpu: members.reduce((sum, proc) => sum + proc.cpu, 0), at: this.deps.now(), runaway: { notified: false }, reported: new Set() });
            kept += 1;
            await this.save(group);
            this.deps.log({ event: "restore", pgid: group.pgid, pid: group.leaderPid, sessionID: group.sessionID, shellID: group.shellID, members: members.map((proc) => proc.pid), leaderAlive });
        }
        return kept;
    }
    /**
     * One scan of the process table: escapees, exits, dropped groups, and each group's cost in the window since the last
     * scan. Returns what the rules decide from.
     */
    async sync(snapshot) {
        const now = this.deps.now();
        const parentToGroup = new Map();
        for (const group of this.groups.values()) {
            for (const proc of liveProcs(snapshot, group.pgid, group.startedAt, this.deps.uid))
                parentToGroup.set(proc.pid, group);
        }
        // A child that left its group (setsid, a detached spawn) is still this shell's work: follow it by pid.
        for (const proc of snapshot.procs) {
            const owner = parentToGroup.get(proc.ppid);
            if (!owner || proc.pgid === owner.pgid || proc.uid !== this.deps.uid)
                continue;
            if (proc.start < Math.floor(owner.startedAt / 1000) - 1)
                continue;
            if (!owner.escapees.includes(proc.pid)) {
                owner.escapees.push(proc.pid);
                void this.save(owner);
                this.deps.log({ event: "escapee", pgid: owner.pgid, pid: proc.pid, command: proc.command });
            }
        }
        const views = [];
        for (const group of [...this.groups.values()]) {
            const floor = Math.floor(group.startedAt / 1000) - 1;
            const members = liveProcs(snapshot, group.pgid, group.startedAt, this.deps.uid);
            const escapees = group.escapees
                .map((pid) => snapshot.byPid.get(pid))
                .filter((proc) => proc !== undefined && proc.uid === this.deps.uid && proc.start >= floor);
            if (group.escapees.length !== escapees.length) {
                group.escapees = escapees.map((proc) => proc.pid);
                void this.save(group);
            }
            const live = [...members, ...escapees];
            if (live.length === 0) {
                await this.drop(group.pgid, "no live members");
                continue;
            }
            const leader = snapshot.byPid.get(group.leaderPid);
            const leaderAlive = leader !== undefined && !leader.zombie && leader.pgid === group.pgid && leader.start === group.leaderStart;
            if (!leaderAlive && group.exitedAt === undefined) {
                group.exitedAt = now;
                void this.save(group);
                this.deps.log({ event: "shell-gone", pgid: group.pgid, shellID: group.shellID });
            }
            const state = this.state(group.pgid);
            const total = live.reduce((sum, proc) => sum + proc.cpu, 0);
            const elapsed = (now - state.at) / 1000;
            const cpu = elapsed > 0 ? Math.max(0, ((total - state.cpu) / elapsed) * 100) : 0;
            state.cpu = total;
            state.at = now;
            views.push({ group, members, escapees, cpu, leaderAlive, orphan: members.length > 0 && !leaderAlive && members.every((proc) => proc.ppid === 1) });
        }
        return views;
    }
    /** The group is over: forget it, in memory and in storage. */
    async drop(pgid, reason) {
        const group = this.groups.get(pgid);
        if (!group)
            return;
        this.groups.delete(pgid);
        this.runtime.delete(pgid);
        await this.deps.store.remove(key(pgid)).catch(() => { });
        this.deps.log({ event: "drop", pgid, shellID: group.shellID, reason });
    }
    /** The runaway clock for one view: one report per continuous over-threshold stretch. */
    runaway(view) {
        return this.state(view.group.pgid).runaway;
    }
    setRunaway(pgid, state) {
        this.state(pgid).runaway = state;
    }
    /** Whether this rule already reported this group (a `dryRun` group stays, so the scan must not repeat itself). */
    reported(pgid, rule) {
        return this.state(pgid).reported.has(rule);
    }
    markReported(pgid, rule) {
        this.state(pgid).reported.add(rule);
    }
    /** The pids this session owns in this snapshot: group members and escapees, all matched to a `shell.created`. */
    trackedPids(sessionID, snapshot) {
        const pids = new Set();
        for (const group of this.groups.values()) {
            if (group.sessionID !== sessionID)
                continue;
            for (const proc of liveProcs(snapshot, group.pgid, group.startedAt, this.deps.uid, group.escapees))
                pids.add(proc.pid);
        }
        return pids;
    }
    /** The monitor's own groups, if the monitor plugin is loaded: never tracked, never signalled. */
    monitorGroups(monitors) {
        return new Set((monitors ?? []).map((monitor) => monitor.pgid));
    }
}
const SHARED_KEY = Symbol.for("opencode.session-procs");
export function acquire(deps, peer) {
    const slot = globalThis;
    let shared = slot[SHARED_KEY];
    if (!shared) {
        shared = { ledger: new Ledger(deps), refs: 0, timer: undefined, scanning: false, restored: false, chain: Promise.resolve(), events: new Map(), sessions: new Map(), peers: new Map() };
        slot[SHARED_KEY] = shared;
    }
    // A reload loads this module again in the same process: the new instance's dependencies (its ctx) become the ones the
    // shared ledger uses, and the old instance's dispose must not take them with it.
    const target = shared;
    target.ledger.rebind(deps);
    const id = Symbol("instance");
    target.peers.set(id, peer);
    target.refs += 1;
    return {
        shared: target,
        release() {
            target.peers.delete(id);
            target.refs = Math.max(0, target.refs - 1);
            if (target.refs === 0) {
                if (target.timer !== undefined)
                    clearTimeout(target.timer);
                target.timer = undefined;
                target.tick = undefined;
            }
        },
    };
}
/** Tests get a fresh process-like view: the singleton is removed. */
export function resetShared() {
    const slot = globalThis;
    delete slot[SHARED_KEY];
}
