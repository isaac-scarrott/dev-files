export interface Window {
    /** Percent, 0-100. */
    readonly utilization: number;
    /** Epoch ms. */
    readonly resetsAt?: number;
}
export interface Reading {
    readonly id: string;
    readonly fiveHour?: Window;
    readonly sevenDay?: Window;
    /** Epoch ms of the successful fetch this reading comes from. */
    readonly fetchedAt?: number;
    readonly problem?: string;
}
export interface Schedule {
    nextAttempt: number;
    backoff: number;
}
export interface UsageState {
    readings: Record<string, Reading>;
    schedules: Record<string, Schedule>;
}
export interface Credential {
    readonly id: string;
    readonly token: string;
}
export interface UsageDeps {
    readonly now: () => number;
    readonly random: () => number;
    readonly fetch: typeof fetch;
    readonly authDir: string;
    /** The notch app's snapshot; its readings are reused so the endpoint is not polled twice. Empty disables. */
    readonly snapshotPath: string;
}
export declare const MIN_INTERVAL_MS: number;
export declare const MAX_BACKOFF_MS: number;
export declare const FAILURE_RETRY_MS = 60000;
export declare function emptyUsageState(): UsageState;
export declare function parseUsageBody(body: unknown): Pick<Reading, "fiveHour" | "sevenDay"> | undefined;
/** Auth files cliproxy owns: `claude-*.json` that are not disabled. Re-read every refresh since cliproxy rewrites tokens. */
export declare function loadCredentials(authDir: string): Promise<Credential[]>;
/** Readings from the notch app's snapshot file. Its dates are seconds since 2001-01-01, Swift's default encoding. */
export declare function loadSnapshot(file: string): Promise<Reading[]>;
export declare class UsageSource {
    private readonly deps;
    readonly state: UsageState;
    private readonly save;
    constructor(deps: UsageDeps, state: UsageState, save: () => Promise<void>);
    /**
     * Current readings for every enabled account. An account is fetched only when its newest reading (ours or the notch
     * app's) is at least five minutes old and its own backoff has passed, so calling this often costs nothing.
     */
    refresh(): Promise<Reading[]>;
    /** Earliest moment any account may be fetched again. Used to avoid waking before a fresh reading is possible. */
    nextPollAt(accountIDs: readonly string[]): number;
    private fetchOne;
    private reschedule;
}
export interface Availability {
    /** An account with every window below 100%, read after the stall. */
    readonly free: boolean;
    /** Soonest moment an exhausted account comes back, counting an account only once all its exhausted windows reset. */
    readonly earliestReset?: number;
    /** Some reading is missing, older than the stall, or says exhausted with a reset that already passed. */
    readonly needsRefresh: boolean;
}
/**
 * Pure. A stalled session can run again when ANY account has both windows free (cliproxy round-robins), so the answer
 * is the minimum over accounts of when that account's exhausted windows have all reset.
 */
export declare function availability(readings: readonly Reading[], now: number, stalledAt: number): Availability;
