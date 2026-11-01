import type { Config } from "./predict"

export const DEFAULT_TTL_MINUTES = 5
export const DEFAULT_MIN_TOKENS = 20_000

const positive = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback

/** `cacheTtlMinutes` and `minTokens` from the plugin's `opencode.json` options; anything else falls back. */
export function readConfig(options: Readonly<Record<string, unknown>> | undefined): Config {
  return {
    ttlMs: positive(options?.cacheTtlMinutes, DEFAULT_TTL_MINUTES) * 60_000,
    minTokens: positive(options?.minTokens, DEFAULT_MIN_TOKENS),
  }
}
