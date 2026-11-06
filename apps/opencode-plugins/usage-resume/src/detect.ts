/** The part of a session error the detector reads. Matches `SessionError.Error` from the plugin SDK. */
export interface ErrorLike {
  readonly type?: string
  readonly message?: string
  readonly status?: number
  readonly response?: { readonly body?: string }
  readonly retryAfterMs?: number
}

export interface UsageLimit {
  /** `five hour`, `seven day`, `overage`, … as the Claude Agent provider prints it; absent when the message names none. */
  readonly kind?: string
  /** Epoch ms the error says usage returns, if it says. */
  readonly resetsAt?: number
}

// OpenCode's own refusals (Zen free tier, Go, Console budgets) are not Claude account limits and resume on their own terms.
const OPENCODE_LIMITS = /^provider\.(free-limit|go-limit|budget-limit|model-budget-limit|chatgpt-limit)$/

// "Claude Code subscription limit reached (five hour). Resets at 2026-10-31T14:05:00.000Z." is what the Claude Agent
// provider builds; the CLI's own result text ("You've hit your limit · resets 2pm") can replace the first sentence.
const LIMIT_TEXT = [
  /subscription limit reached/i,
  /hit your (?:usage |weekly |5[- ]hour )?limit/i,
  /(?:five|5)[- ]hour limit (?:reached|hit)/i,
  /(?:weekly|seven[- ]day) limit (?:reached|hit)/i,
  /usage limit (?:reached|exceeded)/i,
]

const ISO_AFTER_RESETS = /resets?\s+at\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2}))/i
const BODY_RESET = /"(?:resets_at|resetsAt|reset_at)"\s*:\s*(?:"([^"]+)"|(\d{9,13}))/
const KIND = /limit reached \(([a-z _-]+)\)/i
const MAX_AHEAD_MS = 8 * 86_400_000

// CLIProxyAPI's refusal when every Claude account is cooling down for a model. OpenCode rethrows it as
// `provider.rate-limit` with the status and body stripped, so the reset time it carries ("reset_seconds",
// "Retry-After") never reaches us: only usage readings can say when to try again.
const COOLDOWN_TEXT = /all credentials for model [\w.-]*claude[\w.-]* are cooling down/i

function epoch(value: string | number | undefined, base: number): number | undefined {
  if (value === undefined) return undefined
  let ms: number
  if (typeof value === "number") ms = value < 1e11 ? value * 1000 : value
  else if (/^\d{9,13}$/.test(value)) ms = epoch(Number(value), base) ?? NaN
  else ms = Date.parse(value)
  if (!Number.isFinite(ms)) return undefined
  // A reset further away than any real window is a misparse, not a schedule.
  return ms - base > MAX_AHEAD_MS ? undefined : ms
}

/**
 * Whether `error` is a Claude usage limit, and when it says usage returns. `at` is when the failure was recorded
 * (epoch ms), the base for `retryAfterMs`.
 */
export function detectUsageLimit(error: ErrorLike | undefined, at: number): UsageLimit | undefined {
  if (!error) return undefined
  if (error.type && OPENCODE_LIMITS.test(error.type)) return undefined
  const message = error.message ?? ""
  const body = error.response?.body ?? ""
  const textual = LIMIT_TEXT.some((re) => re.test(message))
  const bodied = error.status === 429 && /usage limit|limit reached|"resets?_?at"/i.test(body)
  if (!textual && !bodied) return undefined

  const iso = ISO_AFTER_RESETS.exec(message)?.[1]
  const fromBody = BODY_RESET.exec(body)
  const fromRetry = error.retryAfterMs !== undefined && error.retryAfterMs > 0 ? at + error.retryAfterMs : undefined
  const resetsAt = epoch(iso, at) ?? epoch(fromBody?.[1] ?? (fromBody?.[2] ? Number(fromBody[2]) : undefined), at) ?? epoch(fromRetry, at)
  const kind = KIND.exec(message)?.[1]?.trim().toLowerCase()
  return { kind, resetsAt }
}

/**
 * Whether the run was refused because every cliproxy account is cooling down for Claude. It is a usage wall the same way
 * a 5-hour limit is, but it names no reset time, so the resumer waits on the usage endpoint instead of a stated time.
 * Deliberately not part of `detectUsageLimit`: that one drives the retry hook, and a short 429 is better left to
 * OpenCode's own retry than ended early.
 */
export function detectProviderCooldown(error: ErrorLike | undefined): UsageLimit | undefined {
  if (!error || error.type !== "provider.rate-limit") return undefined
  if (!COOLDOWN_TEXT.test(error.message ?? "")) return undefined
  return { kind: "cooldown" }
}
