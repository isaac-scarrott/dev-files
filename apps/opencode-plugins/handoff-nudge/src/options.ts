export interface Options {
  /** Model ids the plugin watches; `*` is a wildcard and matching is case-insensitive. */
  readonly models: readonly string[]
  /** Context sizes, in tokens, that each warn once per crossing. Ascending. */
  readonly tiers: readonly number[]
  /** A cold wake whose first step writes this many cache tokens is worth a warning. */
  readonly coldWrite: number
}

export const DEFAULTS: Options = {
  models: ["*opus*"],
  tiers: [200_000, 400_000, 700_000],
  coldWrite: 150_000,
}

const NAME = "handoff-nudge option"

function glob(text: string): RegExp {
  const source = text.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp(`^${source}$`, "i")
}

export function modelMatches(id: string | undefined, models: readonly string[]): boolean {
  if (id === undefined) return false
  return models.some((pattern) => glob(pattern).test(id))
}

/** The options as written in `opencode.json`; tokens are counts and `models` are globs. */
export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  const models = raw.models
  if (models !== undefined && (!Array.isArray(models) || models.length === 0 || models.some((m) => typeof m !== "string" || !m.trim()))) {
    throw new Error(`${NAME} models must be a non-empty array of model ids`)
  }
  const tiers = raw.tiers
  if (
    tiers !== undefined &&
    (!Array.isArray(tiers) || tiers.length === 0 || tiers.some((t) => typeof t !== "number" || !Number.isFinite(t) || t <= 0))
  ) {
    throw new Error(`${NAME} tiers must be a non-empty array of token counts`)
  }
  const coldWrite = raw.coldWrite
  if (coldWrite !== undefined && (typeof coldWrite !== "number" || !Number.isFinite(coldWrite) || coldWrite < 0)) {
    throw new Error(`${NAME} coldWrite must be a token count`)
  }
  const sorted = [...((tiers as number[] | undefined) ?? DEFAULTS.tiers)].sort((a, b) => a - b)
  return {
    models: (models as string[] | undefined) ?? DEFAULTS.models,
    tiers: sorted,
    coldWrite: (coldWrite as number | undefined) ?? DEFAULTS.coldWrite,
  }
}
