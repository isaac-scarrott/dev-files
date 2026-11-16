/** One step's token counts, as `session.step.ended` reports them. */
export interface Tokens {
  readonly input: number
  readonly cache: { readonly read: number; readonly write: number }
}

/** A request that has not happened for this long starts from a cold prompt cache (surge-guard's window). */
export const COLD_MS = 60 * 60_000

/** A cold wake is worth at most one warning in this window. */
export const COLD_WARN_MS = 24 * 60 * 60_000

/** What is known about one session. Persisted per session id, so any instance can read and act on it. */
export interface Watch {
  /** The last measured context, in tokens. */
  context: number
  /** The highest tier that has fired and not been re-armed; 0 for none. */
  tier: number
  /** The tier the user dismissed with "Not now": the pill hides until a higher tier fires. */
  dismissed: number
  /** A step has been seen in the current turn; the next turn's first step is the one a cold wake can show on. */
  inTurn: boolean
  /** When the last step ended, for the gap that makes an idle wake cold. */
  lastStepAt?: number
  /** What the last cold wake's first step wrote to the cache. */
  coldWrite?: number
  /** When the cold-wake warning last went out. */
  coldWarnedAt?: number
}

export const emptyWatch = (): Watch => ({ context: 0, tier: 0, dismissed: 0, inTurn: true })

/** The tokens a request re-sends every time: fresh input plus both cache subsets. */
export const contextOf = (tokens: Tokens): number => tokens.input + tokens.cache.read + tokens.cache.write

/** The highest tier at or below `context`, or 0 when none is. */
export function highestReached(tiers: readonly number[], context: number): number {
  let reached = 0
  for (const tier of tiers) if (tier <= context) reached = tier
  return reached
}

/**
 * The highest fired tier that is still above half the context. A tier re-arms once the context falls below half of it,
 * which is what a compaction does; it then fires again when the context grows back.
 */
export function stillFired(tier: number, tiers: readonly number[], context: number): number {
  let kept = 0
  for (const candidate of tiers) if (candidate <= tier && context >= candidate / 2) kept = candidate
  return kept
}

/**
 * Applies one step's tokens: re-arms tiers the context fell below half of, and reports the tier that just fired, if any.
 * A jump past several tiers fires the highest one; the lower ones are crossed and never fire separately.
 */
export function afterStep(watch: Watch, tokens: Tokens, tiers: readonly number[]): { watch: Watch; fired: number } {
  const context = contextOf(tokens)
  const kept = stillFired(watch.tier, tiers, context)
  const reached = highestReached(tiers, context)
  return { watch: { ...watch, context, tier: Math.max(kept, reached) }, fired: reached > kept ? reached : 0 }
}

/** The first step after more than an hour without one re-sends the whole context uncached. */
export const coldGap = (lastStepAt: number | undefined, now: number): boolean => lastStepAt !== undefined && now - lastStepAt > COLD_MS

/** At most one cold warning per session per 24 hours, and only once the wake wrote enough to be worth it. */
export function coldWarningDue(watch: Watch, threshold: number, now: number): boolean {
  if ((watch.coldWrite ?? 0) < threshold) return false
  return watch.coldWarnedAt === undefined || now - watch.coldWarnedAt >= COLD_WARN_MS
}
