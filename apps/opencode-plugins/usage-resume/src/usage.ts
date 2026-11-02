import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

export interface Window {
  /** Percent, 0-100. */
  readonly utilization: number
  /** Epoch ms. */
  readonly resetsAt?: number
}

export interface Reading {
  readonly id: string
  readonly fiveHour?: Window
  readonly sevenDay?: Window
  /** Epoch ms of the successful fetch this reading comes from. */
  readonly fetchedAt?: number
  readonly problem?: string
}

export interface Schedule {
  nextAttempt: number
  backoff: number
}

export interface UsageState {
  readings: Record<string, Reading>
  schedules: Record<string, Schedule>
}

export interface Credential {
  readonly id: string
  readonly token: string
}

export interface UsageDeps {
  readonly now: () => number
  readonly random: () => number
  readonly fetch: typeof fetch
  readonly authDir: string
  /** The notch app's snapshot; its readings are reused so the endpoint is not polled twice. Empty disables. */
  readonly snapshotPath: string
}

// The same floor and backoff as apps/notch-usage: the endpoint rate-limits hard and Claude Code shares the budget.
export const MIN_INTERVAL_MS = 5 * 60_000
export const MAX_BACKOFF_MS = 30 * 60_000
export const FAILURE_RETRY_MS = 60_000
const JITTER_MS = 20_000
const REFERENCE_EPOCH_MS = 978_307_200_000
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"

export function emptyUsageState(): UsageState {
  return { readings: {}, schedules: {} }
}

function window(raw: unknown): Window | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const { utilization, resets_at } = raw as { utilization?: unknown; resets_at?: unknown }
  if (typeof utilization !== "number") return undefined
  const at = typeof resets_at === "string" ? Date.parse(resets_at) : NaN
  return { utilization, resetsAt: Number.isFinite(at) ? at : undefined }
}

export function parseUsageBody(body: unknown): Pick<Reading, "fiveHour" | "sevenDay"> | undefined {
  if (!body || typeof body !== "object") return undefined
  const { five_hour, seven_day } = body as Record<string, unknown>
  return { fiveHour: window(five_hour), sevenDay: window(seven_day) }
}

/** Auth files cliproxy owns: `claude-*.json` that are not disabled. Re-read every refresh since cliproxy rewrites tokens. */
export async function loadCredentials(authDir: string): Promise<Credential[]> {
  const names = (await readdir(authDir).catch(() => [] as string[]))
    .filter((name) => name.startsWith("claude-") && name.endsWith(".json"))
    .sort()
  const out: Credential[] = []
  for (const name of names) {
    try {
      const file = JSON.parse(await readFile(path.join(authDir, name), "utf8")) as { access_token?: unknown; disabled?: unknown }
      if (file.disabled === true || typeof file.access_token !== "string") continue
      out.push({ id: name, token: file.access_token })
    } catch {
      continue
    }
  }
  return out
}

/** Readings from the notch app's snapshot file. Its dates are seconds since 2001-01-01, Swift's default encoding. */
export async function loadSnapshot(file: string): Promise<Reading[]> {
  if (!file) return []
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as { accounts?: Array<Record<string, any>> }
    const date = (value: unknown) => (typeof value === "number" ? value * 1000 + REFERENCE_EPOCH_MS : undefined)
    const win = (value: any): Window | undefined =>
      value && typeof value.utilization === "number" ? { utilization: value.utilization, resetsAt: date(value.resetsAt) } : undefined
    return (raw.accounts ?? []).flatMap((a) =>
      typeof a.id === "string"
        ? [{ id: a.id, fiveHour: win(a.fiveHour), sevenDay: win(a.sevenDay), fetchedAt: date(a.fetchedAt) }]
        : [],
    )
  } catch {
    return []
  }
}

type Outcome = { kind: "ok" } | { kind: "limited"; retryAfterMs?: number } | { kind: "failed" }

export class UsageSource {
  constructor(
    private readonly deps: UsageDeps,
    readonly state: UsageState,
    private readonly save: () => Promise<void>,
  ) {}

  /**
   * Current readings for every enabled account. An account is fetched only when its newest reading (ours or the notch
   * app's) is at least five minutes old and its own backoff has passed, so calling this often costs nothing.
   */
  refresh(): Promise<Reading[]> {
    // The plugin runs once per project location and they share this source: concurrent callers share one pass.
    this.inflight ??= this.refreshNow().finally(() => {
      this.inflight = undefined
    })
    return this.inflight
  }

  private inflight: Promise<Reading[]> | undefined

  private async refreshNow(): Promise<Reading[]> {
    const { now } = this.deps
    const credentials = await loadCredentials(this.deps.authDir)
    const snapshot = new Map((await loadSnapshot(this.deps.snapshotPath)).map((r) => [r.id, r]))
    const t = now()
    let changed = false
    const due: Credential[] = []
    for (const credential of credentials) {
      const shared = snapshot.get(credential.id)
      const own = this.state.readings[credential.id]
      if (shared?.fetchedAt !== undefined && shared.fetchedAt > (own?.fetchedAt ?? 0)) {
        this.state.readings[credential.id] = shared
        changed = true
      }
      const newest = this.state.readings[credential.id]?.fetchedAt ?? 0
      const schedule = this.state.schedules[credential.id]
      if (t - newest >= MIN_INTERVAL_MS && (schedule?.nextAttempt ?? 0) <= t) due.push(credential)
    }
    const results = await Promise.all(due.map(async (credential) => [credential, await this.fetchOne(credential)] as const))
    for (const [credential, outcome] of results) {
      this.reschedule(credential.id, outcome, t)
      changed = true
    }
    if (changed) await this.save()
    return credentials.flatMap((c) => {
      const reading = this.state.readings[c.id]
      return reading ? [reading] : [{ id: c.id } as Reading]
    })
  }

  /** Earliest moment any account may be fetched again. Used to avoid waking before a fresh reading is possible. */
  nextPollAt(accountIDs: readonly string[]): number {
    const t = this.deps.now()
    const times = accountIDs.map((id) => {
      const newest = this.state.readings[id]?.fetchedAt ?? 0
      return Math.max(newest + MIN_INTERVAL_MS, this.state.schedules[id]?.nextAttempt ?? 0, t)
    })
    return times.length ? Math.min(...times) : t + MIN_INTERVAL_MS
  }

  private async fetchOne(credential: Credential): Promise<Outcome> {
    const previous = this.state.readings[credential.id]
    const keep = (problem: string) => {
      this.state.readings[credential.id] = { ...previous, id: credential.id, problem }
    }
    try {
      const response = await this.deps.fetch(USAGE_URL, {
        headers: { Authorization: `Bearer ${credential.token}`, "anthropic-beta": "oauth-2025-04-20" },
        signal: AbortSignal.timeout(10_000),
      })
      if (response.status === 200) {
        const parsed = parseUsageBody(await response.json().catch(() => undefined))
        if (!parsed) {
          keep("Unexpected response")
          return { kind: "ok" }
        }
        this.state.readings[credential.id] = { id: credential.id, ...parsed, fetchedAt: this.deps.now() }
        return { kind: "ok" }
      }
      if (response.status === 401 || response.status === 403) {
        keep("Signed out")
        return { kind: "limited" }
      }
      if (response.status === 429) {
        keep("Rate limited")
        const retry = Number(response.headers.get("retry-after"))
        return { kind: "limited", retryAfterMs: Number.isFinite(retry) && retry > 0 ? retry * 1000 : undefined }
      }
      keep(`Anthropic returned ${response.status}`)
      return { kind: "failed" }
    } catch {
      keep("Offline")
      return { kind: "failed" }
    }
  }

  private reschedule(id: string, outcome: Outcome, t: number): void {
    const jitter = this.deps.random() * JITTER_MS
    const current = this.state.schedules[id] ?? { nextAttempt: 0, backoff: 0 }
    if (outcome.kind === "ok") this.state.schedules[id] = { backoff: 0, nextAttempt: t + MIN_INTERVAL_MS + jitter }
    else if (outcome.kind === "failed") this.state.schedules[id] = { ...current, nextAttempt: t + FAILURE_RETRY_MS + jitter }
    else {
      const backoff = Math.min(Math.max(current.backoff * 2, MIN_INTERVAL_MS), MAX_BACKOFF_MS)
      this.state.schedules[id] = { backoff, nextAttempt: t + Math.max(backoff, outcome.retryAfterMs ?? 0) + jitter }
    }
  }
}

export interface Availability {
  /** An account with every window below 100%, read after the stall. */
  readonly free: boolean
  /** Soonest moment an exhausted account comes back, counting an account only once all its exhausted windows reset. */
  readonly earliestReset?: number
  /** Some reading is missing, older than the stall, or says exhausted with a reset that already passed. */
  readonly needsRefresh: boolean
}

/**
 * Pure. A stalled session can run again when ANY account has both windows free (cliproxy round-robins), so the answer
 * is the minimum over accounts of when that account's exhausted windows have all reset.
 */
export function availability(readings: readonly Reading[], now: number, stalledAt: number): Availability {
  let free = false
  let earliest: number | undefined
  let needsRefresh = readings.length === 0
  for (const reading of readings) {
    const windows = [reading.fiveHour, reading.sevenDay]
    if (reading.fetchedAt === undefined || (!windows[0] && !windows[1])) {
      needsRefresh = true
      continue
    }
    const exhausted = windows.filter((w): w is Window => w !== undefined && w.utilization >= 100)
    if (exhausted.length === 0) {
      if (reading.fetchedAt >= stalledAt) free = true
      else needsRefresh = true
      continue
    }
    if (exhausted.some((w) => w.resetsAt === undefined || w.resetsAt <= now)) {
      needsRefresh = true
      continue
    }
    const back = Math.max(...exhausted.map((w) => w.resetsAt as number))
    earliest = earliest === undefined ? back : Math.min(earliest, back)
  }
  return { free, earliestReset: earliest, needsRefresh }
}
