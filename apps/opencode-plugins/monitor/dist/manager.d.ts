import type { Options } from "./options.js";
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
export declare class Monitors {
    private readonly deps;
    private readonly running;
    /** Writes of one monitor's state, in order, so a late heartbeat cannot land after the removal. */
    private readonly writes;
    private readonly finishedIDs;
    constructor(deps: ManagerDeps);
    get count(): number;
    start(input: StartInput): Promise<MonitorInfo>;
    list(): MonitorInfo[];
    stop(id: string): Promise<MonitorInfo | undefined>;
    /** The session was archived or deleted: its monitors have no one to wake. */
    removeSession(sessionID: string): Promise<void>;
    /**
     * Monitors from a previous run. Every one still within its ttl and event cap comes back (its command starts fresh) and
     * the first wake says so. The rest are forgotten and their session is told once that they are gone.
     */
    restore(): Promise<void>;
    private announceLost;
    dispose(): Promise<void>;
    private create;
    private write;
    private describe;
}
