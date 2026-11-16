// Options from the plugin's `opencode.json` entry, for both halves.

export interface Options {
  /** The least time between two inbox notifications. */
  readonly notifyEveryMin: number
  /** Minutes at which a blocked ask raises another notification. */
  readonly escalateMin: readonly number[]
  /** How long an answered ask is remembered, so a re-ask returns its answer instead of asking again. */
  readonly rememberAnsweredH: number
  /** The minutes a re-ask is worth in the ranking, per ask after the first. */
  readonly reaskWeight: number
}

export const DEFAULTS: Options = {
  notifyEveryMin: 10,
  escalateMin: [15, 60],
  rememberAnsweredH: 24,
  reaskWeight: 30,
}

const NAME = "inbox option"

function minutes(raw: Readonly<Record<string, unknown>>, key: string, fallback: number, min: number): number {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) throw new Error(`${NAME} ${key} must be a number of at least ${min}`)
  return value
}

function escalation(raw: Readonly<Record<string, unknown>>, key: string, fallback: readonly number[]): number[] {
  const value = raw[key]
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item <= 0)) {
    throw new Error(`${NAME} ${key} must be a non-empty array of minutes`)
  }
  return [...(value as number[])].sort((a, b) => a - b)
}

export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  return {
    notifyEveryMin: minutes(raw, "notifyEveryMin", DEFAULTS.notifyEveryMin, 1),
    escalateMin: escalation(raw, "escalateMin", DEFAULTS.escalateMin),
    rememberAnsweredH: minutes(raw, "rememberAnsweredH", DEFAULTS.rememberAnsweredH, 1),
    reaskWeight: minutes(raw, "reaskWeight", DEFAULTS.reaskWeight, 0),
  }
}
