import type { Claims } from "./claims.js";
import type { Host, SessionInfo } from "./host.js";
import type { Options } from "./options.js";
export type Kind = "once" | "every" | "cron";
export interface Job {
    readonly id: string;
    readonly name: string;
    readonly kind: Kind;
    readonly prompt: string;
    readonly sessionID: string;
    /** Display label of the target at creation: `title [ref]`. */
    readonly target: string;
    readonly createdAt: number;
    /** The schedule as the user wrote it, for listings. */
    readonly spec: string;
    readonly everyMs?: number;
    readonly cron?: string;
    readonly maxRuns?: number;
    nextRun: number;
    lastRun?: number;
    runs: number;
    /** Recent fire times, for the loop guard. */
    fires: number[];
    /** Delivery or lookup failures in a row. */
    failures: number;
    status: "active" | "paused";
    pausedReason?: string;
}
export interface Ended {
    readonly id: string;
    readonly name: string;
    readonly target: string;
    readonly reason: string;
    readonly at: number;
    readonly runs: number;
}
export interface State {
    jobs: Job[];
    ended: Ended[];
}
export interface Clock {
    now(): number;
}
export interface AddInput {
    readonly prompt: string;
    readonly at?: string;
    readonly every?: string | number;
    readonly cron?: string;
    readonly name?: string;
    readonly session?: string;
    readonly maxRuns?: number;
}
export declare const STATE_KEY = "state/v1";
export declare const emptyState: () => State;
export declare const isoLocal: (at: number) => string;
export declare class Scheduler {
    private readonly options;
    private readonly clock;
    private readonly storage;
    private readonly state;
    private readonly log;
    /** Any live host that can reach the session API; the server runs one plugin instance per project location. */
    private readonly anyHost;
    private readonly claims;
    private queue;
    constructor(options: Options, clock: Clock, storage: Host["storage"], state: State, log: (message: string) => void, 
    /** Any live host that can reach the session API; the server runs one plugin instance per project location. */
    anyHost: () => Host | undefined, claims: Claims);
    static create(options: Options, clock: Clock, storage: Host["storage"], log: (message: string) => void, anyHost: () => Host | undefined, claims: Claims): Promise<Scheduler>;
    private locked;
    /** Other instances share the stored state and save over it; reread it before acting so nothing runs on a stale copy. */
    private refresh;
    private save;
    private end;
    /** Earliest time an active job is due, or undefined when nothing is waiting. */
    nextDueAt(): number | undefined;
    private nextFor;
    add(host: Host, caller: SessionInfo, input: AddInput): Promise<{
        job: Job;
    }>;
    list(): {
        jobs: Job[];
        ended: Ended[];
    };
    cancel(id: string): Promise<{
        cancelled: Job | undefined;
    }>;
    /** Fire every active job that is due. After sleep or a restart the first call catches up: a missed recurring job fires once. */
    tick(): Promise<void>;
    /**
     * Exactly once per (job, slot) however many instances tick: the slot is claimed in shared storage before anything is
     * sent or saved, and a loser does nothing. The winner rereads the job, since another instance may have finished it
     * between this tick's read and the claim.
     */
    private claimed;
    /** Advance a job past a slot whose claimant died, without sending: a crash skips a run rather than repeating it. */
    private skip;
    private fire;
    private failed;
    private notice;
}
