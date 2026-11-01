/** What survives a restart besides the definition: the re-arm clock, the event counter, and when the service was last seen alive. */
export interface RunState {
    /** Last wake number sent; the next wake continues from it, so a seq is never reused across restarts. */
    readonly seq: number;
    /** How many times the service restarted while this monitor existed (restored or announced lost). */
    readonly restartCount: number;
    /** Last time the monitor was known alive (heartbeat, wake, clean shutdown). */
    readonly aliveAt: number;
    /** Matched lines accepted as events over the monitor's whole life (all re-arms and restarts): what `maxEvents` counts. */
    readonly events: number;
    readonly lastEventAt?: number;
    readonly lastRearmAt?: number;
    readonly nextRearmAt?: number;
}
export declare function parseRunState(value: unknown): RunState | undefined;
/** One sentence naming the window the service was away, from the last time it was known alive. */
export declare function downtimeWindow(aliveAt: number | undefined, now: number): string;
