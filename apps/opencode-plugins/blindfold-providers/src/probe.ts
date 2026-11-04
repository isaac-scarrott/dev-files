import { reason, type Run } from "./run.js"

/** How long a connection test waits for a CLI. A CLI that is asking the 1Password app for permission never answers. */
export const PROBE_MS = 15_000

export type ProbeCode =
  | "ok"
  | "no_token"
  | "token_rejected"
  | "vault_not_found"
  | "rate_limited"
  | "cli_missing"
  | "app_prompt"
  | "timeout"
  | "locked"
  | "not_logged_in"
  | "other"

/** The outcome of a test. Counts and titles only: no value, no token, no session. */
export type Probe = {
  ok: boolean
  code: ProbeCode
  /** The CLI's first error line with every secret scrubbed out. */
  detail?: string
  count?: number
  items?: { id: string; title: string }[]
}

/**
 * Names a failed CLI run. The patterns are the vendors' documented messages and are NOT measured against the real CLIs
 * (DESIGN, onboarding): an unrecognised failure is `other` and shows the CLI's own first line.
 */
export function classify(result: Run, secrets: readonly string[] = [], vault?: string): Probe {
  const detail = reason(result, secrets)
  const text = `${result.stderr}\n${result.stdout}`
  if (result.missing) return { ok: false, code: "cli_missing", detail }
  if (result.timedOut) return { ok: false, code: "timeout", detail: "no answer in time" }
  if (/1password app|desktop app|app integration|biometric|touch id|allow .*(access|cli)/i.test(text)) return { ok: false, code: "app_prompt", detail }
  if (/rate.?limit|too many requests|\(429\)|quota/i.test(text)) return { ok: false, code: "rate_limited", detail }
  if (/isn't a vault|is not a vault|vault .*(not found|doesn't exist|does not exist)|could not find vault|no vault/i.test(text)) return { ok: false, code: "vault_not_found", detail: vault ?? detail }
  if (/invalid service account token|\(401\)|unauthori[sz]ed|authenticat|invalid.*token|token.*(invalid|expired|revoked)/i.test(text)) return { ok: false, code: "token_rejected", detail }
  if (/not logged in|you are not logged/i.test(text)) return { ok: false, code: "not_logged_in", detail }
  if (/locked/i.test(text)) return { ok: false, code: "locked", detail }
  return { ok: false, code: "other", detail }
}
