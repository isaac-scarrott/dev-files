import { type Handoff } from "./handoff.js";
import type { Notify } from "./notify.js";
import type { Options } from "./options.js";
import type { Clock, Spawn } from "./process.js";
import type { RunState } from "./state.js";
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
    /** Persists the run state (re-arm clock, seq, last-alive time). Failures are the caller's to swallow. */
    readonly saveState: (monitor: Monitor, state: RunState) => Promise<void>;
    /** The monitor is over for good; the manager forgets it. */
    readonly finished: (monitor: Monitor, reason: string) => void;
    /** Tells the user (through the hub) about what they would not otherwise see; never decides how. */
    readonly notify?: Notify;
}
export type State = "running" | "waiting" | "ended";
/** A restore: the previous run state (restartCount already counting this restart) and the note for the first wake. */
export interface Resume {
    readonly state: RunState;
    readonly note: string;
}
export declare class Monitor {
    readonly def: Definition;
    private readonly deps;
    state: State;
    startedAt: number;
    events: number;
    lastEventAt: number | undefined;
    paused: boolean;
    restartCount: number;
    lastRearmAt: number | undefined;
    nextRearmAt: number | undefined;
    private seq;
    private restartNotice;
    private heartbeatTimer;
    private child;
    private port;
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
    private cycling;
    private closing;
    private chain;
    private failures;
    /** The command died on its own: the crash was reported as an error, so ending it is not news again. */
    private crashed;
    private readonly matcher;
    constructor(def: Definition, deps: Deps);
    /**
     * A fresh start, or (with `resume`) a restore after a service restart. The process is always new; what is kept is the
     * re-arm clock: a mark still ahead keeps its remaining time, a mark that passed while the service was down counts as
     * satisfied by this fresh start and the next one is set from now. The ttl is the stored absolute `expiresAt`, so
     * neither a re-arm nor a restart extends it.
     */
    start(resume?: Resume): void;
    get pid(): number | undefined;
    /**
     * Plugin reload: the monitor leaves this instance with its process still running. Timers stop, the pipes are held
     * by the port until another instance attaches, nothing is saved or sent and the manager is not told it finished.
     */
    detach(): Handoff;
    /**
     * The other half of a plugin reload: takes over a running monitor. Same process, same counters, no restart count and
     * no notice. Timers are rebuilt from the stored marks (a mark that passed during the gap fires at once), then the
     * pipes are attached, replaying what arrived and an exit that happened in between.
     */
    adopt(handoff: Handoff): void;
    private snapshot;
    private save;
    private heartbeat;
    nextRunAt(): number | undefined;
    private tell;
    /** Ends the monitor on request or because its session went away. No wake. */
    stop(reason: string): Promise<void>;
    /** After a handover: waits for wakes still being delivered, then records the last-alive time. */
    settle(): Promise<void>;
    /** Process-exit backstop: signals the process group at once. */
    killNow(signal: "SIGTERM" | "SIGKILL"): void;
    /** Shutdown path: end the process and wait for it, nothing else. */
    dispose(): Promise<void>;
    private spawnRun;
    /** Routes a child's output and exit into this monitor. An exit already waiting in the port is delivered now. */
    private bind;
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
