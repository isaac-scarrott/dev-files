export interface Options {
    /** Text sent to a stalled session when usage is back. */
    readonly prompt: string;
    /** Wait after the computed reset before checking and resuming. */
    readonly marginMs: number;
    /** How often due sessions are looked at. Timers are not trusted across sleep, so this is a polling interval. */
    readonly tickMs: number;
    /** Resumes per session before giving up, counted until the session completes a run. */
    readonly maxAttempts: number;
    /** Extra wait after the first resume fails again, doubled for each further one. */
    readonly retryBackoffMs: number;
    /** Stalls older than this are dropped. */
    readonly maxWaitMs: number;
    /** Pause between resuming two sessions. */
    readonly staggerMs: number;
    readonly authDir: string;
    /** Empty disables sharing the notch app's readings. */
    readonly snapshotPath: string;
    /** Post a timeline notice when a session starts waiting. */
    readonly notices: boolean;
    /** Also resume subagent sessions (those with a parent). */
    readonly includeChildren: boolean;
}
export declare const DEFAULTS: Options;
/** Durations are given in seconds (`marginSeconds`, `tickSeconds`, …) and held in ms. */
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
