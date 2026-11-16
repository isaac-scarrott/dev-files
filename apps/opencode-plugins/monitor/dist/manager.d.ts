import { type Registry } from "./handoff.js";
import { type WaitOutcome } from "./monitor.js";
import type { Options } from "./options.js";
import type { Notify } from "./notify.js";
import type { Clock, Spawn } from "./process.js";
export interface Store {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
    scan(prefix: string): Promise<{
        key: string;
        value: unknown;
    }[]>;
}
export interface Sessions {
    /** The session's state, or undefined when it no longer exists. */
    state(sessionID: string): Promise<"active" | "archived" | undefined>;
    prompt(sessionID: string, text: string, meta: {
        monitorID: string;
        seq: number;
    }): Promise<void>;
}
export interface ManagerDeps {
    readonly options: Options;
    readonly clock: Clock;
    readonly spawn: Spawn;
    readonly store: Store;
    readonly sessions: Sessions;
    readonly log: (message: string) => void;
    readonly newID?: () => string;
    /** The plugin instance's directory: the plugin loads once per directory and they share storage. */
    readonly origin: string;
    /** Where monitors wait between a plugin reload's old and new instance; shared by every instance in the process. */
    readonly registry: Registry;
    /** Tells the user (through the hub) about what they would not otherwise see. */
    readonly notify?: Notify;
}
export interface StartInput {
    readonly command: string;
    readonly name?: string;
    readonly cwd: string;
    readonly sessionID: string;
    readonly match?: string;
    readonly batchSeconds: number;
    readonly maxEvents?: number;
    readonly ttlMinutes: number;
    readonly rearmMinutes?: number;
}
export interface MonitorInfo {
    readonly id: string;
    readonly name: string;
    readonly command: string;
    readonly cwd: string;
    readonly session: string;
    readonly state: string;
    readonly runningSince: string;
    readonly events: number;
    /** The cap on events over the monitor's life; absent when it has none. */
    readonly maxEvents?: number;
    readonly lastEvent: string | null;
    readonly expiresAt: string;
    readonly rearmMinutes?: number;
    readonly nextRunAt?: string;
    /** When the schedule last started a fresh run (a re-arm, or the restart that satisfied a due one); absent until it has. */
    readonly lastRearm?: string;
    readonly nextRearm?: string;
    /** Service restarts this monitor has been through. */
    readonly restartCount: number;
    readonly pid?: number;
    readonly paused?: boolean;
}
/** A monitor a tool call can name, running or ended recently: an id, and the name the caller may have used instead. */
export interface Named {
    readonly id: string;
    readonly name: string;
    readonly session: string;
}
export declare class Monitors {
    private readonly deps;
    private readonly running;
    /** Writes of one monitor's state, in order, so a late heartbeat cannot land after the removal. */
    private readonly writes;
    private readonly finishedIDs;
    /** Monitors that ended recently: what `monitor.wait` answers when it arrives just after the end. */
    private readonly finished;
    /** The instance is gone: a restore still queued from its setup must not start anything. */
    private disposed;
    constructor(deps: ManagerDeps);
    get count(): number;
    /** The process groups of this instance's running monitors: another plugin must never track or signal them. */
    active(): {
        sessionID: string;
        pgid: number;
    }[];
    start(input: StartInput): Promise<MonitorInfo>;
    list(): MonitorInfo[];
    /** The session a monitor wakes, running or recently finished; undefined when there is no such monitor. */
    owner(id: string): string | undefined;
    /**
     * Every monitor a call can name: the running ones, then the ones that ended within the wait window. `monitor.wait` and
     * `monitor.stop` take an id, and an agent that passes the name it gave at start gets it resolved from here.
     */
    known(): Named[];
    /**
     * Blocks until the monitor produces its next batch of lines, ends, or `timeoutMs` passes. Undefined when no monitor
     * (running or recently finished) has that id. One that already ended returns its exit code and last lines at once.
     */
    wait(id: string, timeoutMs: number, signal?: AbortSignal): Promise<WaitOutcome | undefined>;
    private pruneFinished;
    stop(id: string): Promise<MonitorInfo | undefined>;
    /** The session was archived or deleted: its monitors have no one to wake. */
    removeSession(sessionID: string): Promise<void>;
    /**
     * Start the restore after the caller's setup has returned. A restore announces lost monitors by steering their
     * sessions, and a session whose project is still booting its plugins cannot take that until its own setup returns:
     * on 2026-11-15 21:44 every session in that project stayed busy waiting for a setup that was waiting for them.
     * A macrotask, not a microtask, so the promise setup returns has settled before the first delivery starts.
     */
    restoreAfterSetup(): void;
    /**
     * Monitors from a previous run. Every one still within its ttl and event cap comes back (its command starts fresh) and
     * the first wake says so. The rest are forgotten, and their session is told once that they are gone, unless the loss
     * is old enough that the notice would only interrupt a session that has moved on.
     */
    restore(): Promise<void>;
    private tell;
    /** Tells a session its monitor is gone. Failure is logged, never retried: the definition is already removed. */
    private announceLost;
    /**
     * Service shutdown ends every process. A plugin reload (the module loaded again in the same process) leaves them
     * running: they wait in the registry for the new instance, which adopts them.
     */
    dispose(): Promise<void>;
    private release;
    private create;
    private write;
    private describe;
}
