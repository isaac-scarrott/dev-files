/** A request that has not happened for this long starts from a cold prompt cache (surge-guard's window). */
export const COLD_MS = 60 * 60_000;
/** A cold wake is worth at most one warning in this window. */
export const COLD_WARN_MS = 24 * 60 * 60_000;
export const emptyWatch = () => ({ context: 0, tier: 0, dismissed: 0, inTurn: true });
/** The tokens a request re-sends every time: fresh input plus both cache subsets. */
export const contextOf = (tokens) => tokens.input + tokens.cache.read + tokens.cache.write;
/** The highest tier at or below `context`, or 0 when none is. */
export function highestReached(tiers, context) {
    let reached = 0;
    for (const tier of tiers)
        if (tier <= context)
            reached = tier;
    return reached;
}
/**
 * The highest fired tier that is still above half the context. A tier re-arms once the context falls below half of it,
 * which is what a compaction does; it then fires again when the context grows back.
 */
export function stillFired(tier, tiers, context) {
    let kept = 0;
    for (const candidate of tiers)
        if (candidate <= tier && context >= candidate / 2)
            kept = candidate;
    return kept;
}
/**
 * Applies one step's tokens: re-arms tiers the context fell below half of, and reports the tier that just fired, if any.
 * A jump past several tiers fires the highest one; the lower ones are crossed and never fire separately.
 */
export function afterStep(watch, tokens, tiers) {
    const context = contextOf(tokens);
    const kept = stillFired(watch.tier, tiers, context);
    const reached = highestReached(tiers, context);
    return { watch: { ...watch, context, tier: Math.max(kept, reached) }, fired: reached > kept ? reached : 0 };
}
/** The first step after more than an hour without one re-sends the whole context uncached. */
export const coldGap = (lastStepAt, now) => lastStepAt !== undefined && now - lastStepAt > COLD_MS;
/** At most one cold warning per session per 24 hours, and only once the wake wrote enough to be worth it. */
export function coldWarningDue(watch, threshold, now) {
    if ((watch.coldWrite ?? 0) < threshold)
        return false;
    return watch.coldWarnedAt === undefined || now - watch.coldWarnedAt >= COLD_WARN_MS;
}
//# sourceMappingURL=measure.js.map