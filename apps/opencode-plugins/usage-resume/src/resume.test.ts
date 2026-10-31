import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { detectUsageLimit } from "./detect.js"
import { DEFAULTS, parseOptions, type Options } from "./options.js"
import { Resumer, type Clock, type Host } from "./resume.js"
import { availability, MIN_INTERVAL_MS, type Reading } from "./usage.js"

const T0 = Date.UTC(2026, 9, 31, 12, 0, 0)
const MIN = 60_000
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()
const limitError = (resetsAt?: number, kind = "five hour") => ({
  type: "unknown",
  message: `Claude Code subscription limit reached (${kind}).${resetsAt ? ` Resets at ${iso(resetsAt)}.` : ""}`,
})

type Body = { five_hour?: { utilization: number; resets_at: string } | null; seven_day?: { utilization: number; resets_at: string } | null }
const win = (utilization: number, resetsAt: number) => ({ utilization, resets_at: iso(resetsAt) })

interface Env {
  clock: Clock & { t: number }
  host: Host
  prompts: Array<Record<string, any>>
  notices: string[]
  sessions: Map<string, Record<string, any>>
  storage: Map<string, unknown>
  /** token-name -> usage body or HTTP status */
  usage: Map<string, Body | number>
  fetches: string[]
  options: Options
  make(): Promise<Resumer>
  authDir: string
}

async function env(accounts: Record<string, Body | number>, overrides: Partial<Options> = {}): Promise<Env> {
  const authDir = await mkdtemp(path.join(os.tmpdir(), "usage-resume-"))
  const usage = new Map(Object.entries(accounts))
  for (const name of Object.keys(accounts)) {
    await writeFile(path.join(authDir, `claude-${name}.json`), JSON.stringify({ access_token: `tok-${name}`, email: `${name}@x.test` }))
  }
  const clock = { t: T0, now: () => clock.t, sleep: async () => {} }
  const sessions = new Map<string, Record<string, any>>()
  const prompts: Array<Record<string, any>> = []
  const notices: string[] = []
  const storage = new Map<string, unknown>()
  const fetches: string[] = []
  const host = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const s = sessions.get(sessionID)
        if (!s) throw new Error("not found")
        return s
      },
      prompt: async (input: Record<string, any>) => {
        prompts.push(input)
        return { id: "inbox_1" }
      },
      synthetic: async (input: Record<string, any>) => {
        notices.push(input.text)
        return { id: "inbox_2" }
      },
    },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, JSON.parse(JSON.stringify(value))),
    },
  } as unknown as Host
  const options: Options = { ...DEFAULTS, authDir, snapshotPath: "", staggerMs: 0, ...overrides }
  const fakeFetch = (async (_url: string, init: { headers: Record<string, string> }) => {
    const name = init.headers.Authorization.replace("Bearer tok-", "")
    fetches.push(name)
    const body = usage.get(name)
    if (typeof body === "number") return new Response("{}", { status: body })
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
  const out: Env = {
    clock, host, prompts, notices, sessions, storage, usage, fetches, options, authDir,
    make: () => Resumer.create(host, out.options, clock, { random: () => 0, fetch: fakeFetch }),
  }
  return out
}

/** A session whose run failed at `at`. */
function stalled(e: Env, id: string, at: number, extra: Record<string, any> = {}) {
  e.sessions.set(id, { id, outcome: "failed", time: { created: at - HOUR, busy: at - MIN, idle: at }, ...extra })
}

const bothFree = { five_hour: win(10, T0 + 5 * HOUR), seven_day: win(20, T0 + 100 * HOUR) }

test("detects the Claude Agent provider's limit message and reads its reset time", () => {
  const at = T0
  const found = detectUsageLimit(limitError(T0 + 2 * HOUR), at)
  assert.equal(found?.kind, "five hour")
  assert.equal(found?.resetsAt, T0 + 2 * HOUR)
  assert.equal(detectUsageLimit(limitError(undefined, "seven day"), at)?.resetsAt, undefined)
  assert.equal(detectUsageLimit({ message: "You've hit your limit · resets 2pm" }, at) !== undefined, true)
})

test("detects a 429 body with a reset and falls back to retryAfterMs", () => {
  const body = JSON.stringify({ error: { message: "usage limit reached", resets_at: iso(T0 + HOUR) } })
  assert.equal(detectUsageLimit({ type: "provider.rate-limit", status: 429, message: "x", response: { body } }, T0)?.resetsAt, T0 + HOUR)
  const retry = detectUsageLimit({ type: "unknown", message: "Claude Code subscription limit reached.", retryAfterMs: 90 * MIN }, T0)
  assert.equal(retry?.resetsAt, T0 + 90 * MIN)
})

test("ignores other failures and OpenCode's own limits", () => {
  assert.equal(detectUsageLimit({ type: "provider.go-limit", message: "OpenCode Go usage limit reached." }, T0), undefined)
  assert.equal(detectUsageLimit({ type: "provider.free-limit", message: "Free usage limit reached." }, T0), undefined)
  assert.equal(detectUsageLimit({ type: "provider.rate-limit", status: 429, message: "slow down", response: { body: "{}" } }, T0), undefined)
  assert.equal(detectUsageLimit({ type: "provider.auth", message: "Run `claude auth login`" }, T0), undefined)
  assert.equal(detectUsageLimit(undefined, T0), undefined)
})

test("a reset implausibly far away is not trusted", () => {
  assert.equal(detectUsageLimit(limitError(T0 + 30 * 86_400_000), T0)?.resetsAt, undefined)
})

test("availability: an account is back only when all its exhausted windows reset; the earliest account wins", () => {
  const readings: Reading[] = [
    { id: "a", fiveHour: { utilization: 100, resetsAt: T0 + 2 * HOUR }, sevenDay: { utilization: 100, resetsAt: T0 + 50 * HOUR }, fetchedAt: T0 },
    { id: "b", fiveHour: { utilization: 100, resetsAt: T0 + 3 * HOUR }, sevenDay: { utilization: 40 }, fetchedAt: T0 },
    { id: "c", sevenDay: { utilization: 100, resetsAt: T0 + 30 * HOUR }, fetchedAt: T0 },
  ]
  const a = availability(readings, T0, T0)
  assert.equal(a.free, false)
  assert.equal(a.earliestReset, T0 + 3 * HOUR)
  assert.equal(availability([...readings, { id: "d", fiveHour: { utilization: 99 }, fetchedAt: T0 }], T0, T0).free, true)
})

test("availability: a reading older than the stall cannot prove usage is free, and a passed reset needs a refresh", () => {
  assert.deepEqual(availability([{ id: "a", fiveHour: { utilization: 5 }, fetchedAt: T0 - MIN }], T0, T0), { free: false, earliestReset: undefined, needsRefresh: true })
  const past = availability([{ id: "a", fiveHour: { utilization: 100, resetsAt: T0 - 1 }, fetchedAt: T0 - HOUR }], T0, T0)
  assert.equal(past.needsRefresh, true)
})

test("waits for the earliest account reset across accounts, not the error's later one", async () => {
  const e = await env({
    a: { five_hour: win(100, T0 + 2 * HOUR), seven_day: win(30, T0 + 90 * HOUR) },
    b: { five_hour: win(100, T0 + 3 * HOUR), seven_day: win(100, T0 + 40 * HOUR) },
    c: { five_hour: win(20, T0 + 4 * HOUR), seven_day: win(100, T0 + 80 * HOUR) },
  })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + 4 * HOUR), T0)
  assert.equal(r.waiting()[0]!.dueAt, T0 + 2 * HOUR + DEFAULTS.marginMs)
  assert.match(e.notices[0]!, /Resumes automatically at/)
})

test("uses the error's reset when no account data is available", async () => {
  const e = await env({ a: 401 })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + 2 * HOUR), T0)
  assert.equal(r.waiting()[0]!.dueAt >= T0 + 2 * HOUR + DEFAULTS.marginMs, true)
})

test("adds the margin and re-verifies: still limited after the reset reschedules, then resumes once free", async () => {
  const e = await env({ a: { five_hour: win(100, T0 + HOUR), seven_day: win(10, T0 + 99 * HOUR) } })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + HOUR), T0)
  assert.equal(r.waiting()[0]!.dueAt, T0 + HOUR + DEFAULTS.marginMs)

  // Just before the margin ends nothing happens.
  e.clock.t = T0 + HOUR + DEFAULTS.marginMs - 1
  await r.tick()
  assert.equal(e.prompts.length, 0)

  // The reset time passed but Anthropic still reports 100% with a later reset: reschedule, do not resume.
  e.usage.set("a", { five_hour: win(100, T0 + 2 * HOUR), seven_day: win(10, T0 + 99 * HOUR) })
  e.clock.t = T0 + HOUR + DEFAULTS.marginMs
  await r.tick()
  assert.equal(e.prompts.length, 0)
  assert.equal(r.waiting()[0]!.dueAt, T0 + 2 * HOUR + DEFAULTS.marginMs)

  e.usage.set("a", bothFree)
  e.clock.t = T0 + 2 * HOUR + DEFAULTS.marginMs
  await r.tick()
  assert.equal(e.prompts.length, 1)
  assert.deepEqual({ ...e.prompts[0] }, { sessionID: "ses_1", text: "Continue.", delivery: "queue" })
  assert.equal(r.waiting().length, 0)
})

test("resumes as soon as any account is free, even when the error's own account is not", async () => {
  const e = await env({
    a: { five_hour: win(100, T0 + 4 * HOUR), seven_day: win(10, T0 + 99 * HOUR) },
    b: { five_hour: win(100, T0 + 10 * MIN), seven_day: win(10, T0 + 99 * HOUR) },
  })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + 4 * HOUR), T0)
  assert.equal(r.waiting()[0]!.dueAt, T0 + 10 * MIN + DEFAULTS.marginMs)
  e.usage.set("b", bothFree)
  e.clock.t = T0 + 10 * MIN + DEFAULTS.marginMs
  await r.tick()
  assert.equal(e.prompts.length, 1)
})

test("does not resume a session the user touched, archived, deleted or that finished otherwise", async () => {
  const e = await env({ a: bothFree })
  const r = await e.make()
  const cases: Array<[string, Record<string, any> | undefined]> = [
    ["touched", { time: { busy: T0 + 30 * MIN, idle: T0 + 31 * MIN } }],
    ["running", { time: { busy: T0 + 30 * MIN } }],
    ["archived", { time: { busy: T0 - MIN, idle: T0, archived: T0 + MIN } }],
    ["done", { outcome: "succeeded", time: { busy: T0 - MIN, idle: T0 } }],
    ["deleted", undefined],
  ]
  for (const [id] of cases) {
    stalled(e, id, T0)
    await r.onFailed(id, limitError(T0 + MIN), T0)
  }
  assert.equal(r.waiting().length, cases.length)
  for (const [id, change] of cases) {
    if (change) e.sessions.set(id, { id, outcome: "failed", ...change, time: { created: T0 - HOUR, ...change.time } })
    else e.sessions.delete(id)
  }
  e.clock.t = T0 + 2 * HOUR
  await r.tick()
  assert.equal(e.prompts.length, 0)
  assert.equal(r.waiting().length, 0)
})

test("a user message or a new run while waiting cancels the wait", async () => {
  const e = await env({ a: bothFree })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + MIN), T0)
  await r.onSettled("ses_1")
  e.clock.t = T0 + HOUR
  await r.tick()
  assert.equal(e.prompts.length, 0)
})

test("skips archived sessions at the stall and subagent sessions by default", async () => {
  const e = await env({ a: bothFree })
  stalled(e, "child", T0, { parentID: "ses_p" })
  stalled(e, "old", T0, { time: { archived: T0 - HOUR } })
  const r = await e.make()
  await r.onFailed("child", limitError(T0 + MIN), T0)
  await r.onFailed("old", limitError(T0 + MIN), T0)
  assert.equal(r.waiting().length, 0)
  e.options = { ...e.options, includeChildren: true }
  const withChildren = await e.make()
  await withChildren.onFailed("child", limitError(T0 + MIN), T0)
  assert.equal(withChildren.waiting().length, 1)
})

test("ignores errors that are not usage limits", async () => {
  const e = await env({ a: bothFree })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", { type: "provider.timeout", message: "timed out" }, T0)
  assert.equal(r.waiting().length, 0)
  assert.equal(e.notices.length, 0)
})

test("no loops: resumes at most maxAttempts times, with growing backoff, and a success resets the count", async () => {
  const e = await env({ a: bothFree }, { maxAttempts: 2 })
  const r = await e.make()
  let at = T0
  const stall = async () => {
    stalled(e, "ses_1", at)
    await r.onFailed("ses_1", limitError(at + MIN), at)
  }
  await stall()
  const first = r.waiting()[0]!
  assert.equal(first.notBefore, at + DEFAULTS.marginMs)
  e.clock.t = at + HOUR
  await r.tick()
  assert.equal(e.prompts.length, 1)

  // The resumed run hits the limit again: backoff applies to the second wait.
  at = e.clock.t
  await stall()
  assert.equal(r.waiting()[0]!.notBefore, at + DEFAULTS.marginMs + DEFAULTS.retryBackoffMs)
  e.clock.t = at + HOUR
  await r.tick()
  assert.equal(e.prompts.length, 2)

  // Third failure: capped.
  at = e.clock.t
  await stall()
  assert.equal(r.waiting().length, 0)
  e.clock.t = at + 10 * HOUR
  await r.tick()
  assert.equal(e.prompts.length, 2)
  assert.match(e.notices.at(-1)!, /Not resuming automatically/)

  await r.onSettled("ses_1", true)
  assert.equal(r.attempts("ses_1"), undefined)
})

test("a failed prompt keeps the session waiting and still counts toward the cap", async () => {
  const e = await env({ a: bothFree })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + MIN), T0)
  ;(e.host.session as any).prompt = async () => {
    throw new Error("server down")
  }
  e.clock.t = T0 + HOUR
  await r.tick()
  assert.equal(r.waiting().length, 1)
  assert.equal(r.attempts("ses_1")?.count, 1)
  assert.equal(r.waiting()[0]!.dueAt, T0 + HOUR + DEFAULTS.retryBackoffMs)
})

test("the waiting state survives a restart", async () => {
  const e = await env({ a: { five_hour: win(100, T0 + 2 * HOUR), seven_day: win(10, T0 + 99 * HOUR) } })
  stalled(e, "ses_1", T0)
  const before = await e.make()
  await before.onFailed("ses_1", limitError(T0 + 2 * HOUR), T0)
  const due = before.waiting()[0]!.dueAt

  const after = await e.make()
  assert.equal(after.waiting().length, 1)
  assert.equal(after.waiting()[0]!.dueAt, due)
  e.usage.set("a", bothFree)
  e.clock.t = due
  await after.tick()
  assert.equal(e.prompts.length, 1)
})

test("sleep: a clock that jumps hours past the due time is caught up by the next tick", async () => {
  const e = await env({ a: { five_hour: win(100, T0 + 2 * HOUR), seven_day: win(10, T0 + 99 * HOUR) } })
  stalled(e, "ses_1", T0)
  stalled(e, "ses_2", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + 2 * HOUR), T0)
  await r.onFailed("ses_2", limitError(T0 + 2 * HOUR), T0)
  e.usage.set("a", bothFree)
  // No ticks while the laptop sleeps; then the first tick after wake does everything due.
  e.clock.t = T0 + 9 * HOUR
  await r.tick()
  assert.deepEqual(e.prompts.map((p) => p.sessionID).sort(), ["ses_1", "ses_2"])
})

test("usage endpoint: five-minute floor, 429 backoff doubles, never hammered", async () => {
  const e = await env({ a: 429 })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + 10 * HOUR), T0)
  assert.equal(e.fetches.length, 1)
  // Many ticks inside the backoff window make no requests.
  for (let i = 1; i <= 8; i++) {
    e.clock.t = T0 + i * 30_000
    await r.tick()
  }
  assert.equal(e.fetches.length, 1)
  e.clock.t = T0 + MIN_INTERVAL_MS + 1
  await (r as any).evaluate(r.waiting()[0])
  assert.equal(e.fetches.length, 2)
  await (r as any).evaluate(r.waiting()[0])
  assert.equal(e.fetches.length, 2)
  const schedule = (e.storage.get("state/v1") as any).usage.schedules["claude-a.json"]
  assert.equal(schedule.backoff, 2 * MIN_INTERVAL_MS)
})

test("reuses the notch app's snapshot instead of polling when it is fresh", async () => {
  const e = await env({ a: 500 })
  const REF = 978_307_200_000
  const sec = (ms: number) => (ms - REF) / 1000
  const snapshotPath = path.join(e.authDir, "snapshot.json")
  await writeFile(
    snapshotPath,
    JSON.stringify({ schedules: {}, accounts: [{ id: "claude-a.json", fetchedAt: sec(T0 + MIN), fiveHour: { utilization: 100, resetsAt: sec(T0 + 2 * HOUR) } }] }),
  )
  e.options = { ...e.options, snapshotPath }
  stalled(e, "ses_1", T0)
  const r = await e.make()
  e.clock.t = T0 + 2 * MIN
  await r.onFailed("ses_1", limitError(), T0 + 2 * MIN)
  assert.equal(e.fetches.length, 0)
  assert.equal(r.waiting()[0]!.dueAt, T0 + 2 * HOUR + DEFAULTS.marginMs)
})

test("an overage rejection waits for the error's reset only", async () => {
  const e = await env({ a: bothFree })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + 3 * HOUR, "overage"), T0)
  assert.equal(r.waiting()[0]!.dueAt, T0 + 3 * HOUR + DEFAULTS.marginMs)
  e.clock.t = T0 + 3 * HOUR + DEFAULTS.marginMs
  await r.tick()
  assert.equal(e.prompts.length, 1)
})

test("reset passed but usage cannot be read: resumes unverified after two checks, never earlier", async () => {
  const e = await env({ a: 500 })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + HOUR), T0)
  e.clock.t = T0 + HOUR + DEFAULTS.marginMs
  await r.tick()
  assert.equal(e.prompts.length, 0)
  e.clock.t = r.waiting()[0]!.dueAt
  await r.tick()
  assert.equal(e.prompts.length, 1)
})

test("notices can be turned off and the prompt text is configurable", async () => {
  const e = await env({ a: bothFree }, { notices: false, prompt: "Carry on." })
  stalled(e, "ses_1", T0)
  const r = await e.make()
  await r.onFailed("ses_1", limitError(T0 + MIN), T0)
  assert.equal(e.notices.length, 0)
  e.clock.t = T0 + HOUR
  await r.tick()
  assert.equal(e.prompts[0]!.text, "Carry on.")
})

test("options validate", () => {
  assert.equal(parseOptions({}).prompt, "Continue.")
  assert.equal(parseOptions({ marginSeconds: 5 }).marginMs, 5000)
  assert.equal(parseOptions({ maxWaitHours: 2 }).maxWaitMs, 2 * HOUR)
  assert.throws(() => parseOptions({ maxAttempts: 0 }))
  assert.throws(() => parseOptions({ prompt: " " }))
})
