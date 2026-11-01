import type { Options } from "./options.js";
import type { Clock, Spawn } from "./process.js";
/** What is stored: the definition of a monitor, never its output. */
export interface Definition {
    readonly id: string;
    readonly name: string;
    readonly command: string;
    readonly cwd: string;
    /** The session that receives the wakes. */
    readonly sessionID: string;
    readonly match?: string;
    readonly batchSeconds: number;
    readonly maxEvents?: number;
    readonly rearmMinutes?: number;
    readonly createdAt: number;
    /** Directory of the plugin instance that started it; only that instance restores it. */
    readonly origin: string;
    readonly expiresAt: number;
}
export interface Deps {
    readonly options: Options;
    readonly clock: Clock;
    readonly spawn: Spawn;
    readonly deliver: (sessionID: string, text: string, meta: {
        monitorID: string;
        seq: number;
    }) => Promise<void>;
    readonly log: (message: string) => void;
    /** The monitor is over for good; the manager forgets it. */
    readonly finished: (monitor: Monitor, reason: string) => void;
}
export type State = "running" | "waiting" | "ended";
export declare class Monitor {
    readonly def: Definition;
    private readonly deps;
    state: State;
    startedAt: number;
    events: number;
    lastEventAt: number | undefined;
    paused: boolean;
    private seq;
    private child;
    private exited;
    private splitter;
    private pending;
    private pendingBytes;
    private dropped;
    private notes;
    private window;
    private batchTimer;
    private cycleTimer;
    private ttlTimer;
    private cycleStart;
    private cycling;
    private closing;
    private chain;
    private failures;
    private readonly matcher;
    constructor(def: Definition, deps: Deps);
    /** `note` goes into the first wake, for example that the monitor came back after a restart. */
    start(note?: string): void;
    nextRunAt(): number | undefined;
    /** Ends the monitor on request or because its session went away. No wake. */
    stop(reason: string): Promise<void>;
    /** Shutdown path: end the process and wait for it, nothing else. */
    dispose(): Promise<void>;
    private spawnRun;
    private onExit;
    /** The re-arm schedule fired: start a fresh run, ending the current one first if it is still going. */
    private cycle;
    private accept;
    private scheduleFlush;
    private flush;
    /** The monitor is finished by itself (exit, ttl, event limit): last wake with what is left, then forget it. */
    private end;
    private clearTimers;
    private signalChild;
    private terminate;
}
