/** One step's token counts, as `session.step.ended` reports them. */
export interface Tokens {
    readonly input: number;
    readonly cache: {
        readonly read: number;
        readonly write: number;
    };
}
/** A request that has not happened for this long starts from a cold prompt cache (surge-guard's window). */
export declare const COLD_MS: number;
/** A cold wake is worth at most one warning in this window. */
export declare const COLD_WARN_MS: number;
/** What is known about one session. Persisted per session id, so any instance can read and act on it. */
export interface Watch {
    /** The last measured context, in tokens. */
    context: number;
    /** The highest tier that has fired and not been re-armed; 0 for none. */
    tier: number;
    /** The tier the user dismissed with "Not now": the pill hides until a higher tier fires. */
    dismissed: number;
    /** A step has been seen in the current turn; the next turn's first step is the one a cold wake can show on. */
    inTurn: boolean;
    /** When the last step ended, for the gap that makes an idle wake cold. */
    lastStepAt?: number;
    /** What the last cold wake's first step wrote to the cache. */
    coldWrite?: number;
    /** When the cold-wake warning last went out. */
    coldWarnedAt?: number;
}
export declare const emptyWatch: () => Watch;
/** The tokens a request re-sends every time: fresh input plus both cache subsets. */
export declare const contextOf: (tokens: Tokens) => number;
/** The highest tier at or below `context`, or 0 when none is. */
export declare function highestReached(tiers: readonly number[], context: number): number;
/**
 * The highest fired tier that is still above half the context. A tier re-arms once the context falls below half of it,
 * which is what a compaction does; it then fires again when the context grows back.
 */
export declare function stillFired(tier: number, tiers: readonly number[], context: number): number;
/**
 * Applies one step's tokens: re-arms tiers the context fell below half of, and reports the tier that just fired, if any.
 * A jump past several tiers fires the highest one; the lower ones are crossed and never fire separately.
 */
export declare function afterStep(watch: Watch, tokens: Tokens, tiers: readonly number[]): {
    watch: Watch;
    fired: number;
};
/** The first step after more than an hour without one re-sends the whole context uncached. */
export declare const coldGap: (lastStepAt: number | undefined, now: number) => boolean;
/** At most one cold warning per session per 24 hours, and only once the wake wrote enough to be worth it. */
export declare function coldWarningDue(watch: Watch, threshold: number, now: number): boolean;
