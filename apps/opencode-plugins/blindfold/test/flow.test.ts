// Flow approval: one card for a whole sign-in. Units for the grant store and the rules store; the rest runs the server against
// the fixture `op` of blindfold-providers. Every value is fake.
import { after, test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { memoryTokens } from "../../blindfold-providers/src/keychain.js"
import { OnePassword } from "../../blindfold-providers/src/onepassword.js"
import { createGrants, flowOf, parseFlowMinutes } from "../plugin/src/flow"
import { covering, migrateRules, savedRules, type SavedRule } from "../plugin/src/rules"
import { registerProvider, type Account } from "../plugin/src/providers-contract"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { context, harness } from "./harness"

const root = new URL("../../blindfold-providers/", import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), "bf-flow-"))
process.env.FIXTURE_STATE = join(dir, "fixture")
process.env.XDG_DATA_HOME = join(dir, "data")
after(() => rmSync(dir, { recursive: true, force: true }))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const PW = "fixture-google-pw"
const EMAIL = "personal.fixture@example.test"
const GOOGLE = "https://accounts.google.com"

// ---- units ------------------------------------------------------------------------------------------------------------

const use = { session: "s1", tabID: "t1", origin: GOOGLE, account: "personal", item: "i1", part: "password" }

test("grants: each part once, bound to session, tab, origin, account, item and part; expiry on a fake clock", () => {
  let now = 1000
  const grants = createGrants({ now: () => now, minutes: 3 })
  const grant = grants.create({ session: "s1", tabID: "t1", origin: GOOGLE, account: "personal", item: "i1", parts: ["username", "password", "otp"], used: ["username"] })
  assert.equal(grant.expiresAt, 1000 + 180_000)
  assert.equal(grants.peek({ ...use, part: "username" }), undefined, "the part this request already used is spent")
  assert.equal(grants.peek(use)?.id, grant.id, "peek does not spend")
  assert.equal(grants.take(use)?.id, grant.id)
  assert.equal(grants.take(use), undefined, "each part once")
  for (const other of [{ session: "s2" }, { tabID: "t2" }, { origin: "https://accounts.google.com.evil.test" }, { origin: "http://accounts.google.com" }, { account: "work" }, { item: "i2" }, { part: "Security answer" }]) {
    assert.equal(grants.take({ ...use, part: "otp", ...other }), undefined, JSON.stringify(other))
  }
  assert.equal(grants.take({ ...use, part: "otp" })?.id, grant.id, "the grant is intact after the refusals")
  grants.release(grant.id, "otp")
  assert.ok(grants.peek({ ...use, part: "otp" }), "a part given back can be used again")
  now += 180_000
  assert.equal(grants.peek({ ...use, part: "otp" }), undefined, "expired")
  assert.equal(grants.size, 0)
})

test("grants: a closed tab or a navigation off the origin ends them; other tabs and origins stay", () => {
  const grants = createGrants()
  const make = (tabID: string, origin = GOOGLE) => grants.create({ session: "s1", tabID, origin, account: "a", item: "i", parts: ["password"] })
  make("t1")
  make("t2")
  grants.revokeOffOrigin("t1", GOOGLE)
  assert.equal(grants.size, 2, "same origin keeps it")
  grants.revokeOffOrigin("t1", "https://example.test")
  assert.deepEqual(grants.list().map((grant) => grant.tabID), ["t2"])
  grants.revokeOffOrigin("t2", undefined)
  assert.equal(grants.size, 0, "an unknown destination ends it")
  make("t1")
  make("t2")
  grants.revokeTab("t1")
  assert.deepEqual(grants.list().map((grant) => grant.tabID), ["t2"])
  grants.revokeTab()
  assert.equal(grants.size, 0, "no tab named: all")
})

test("grants: concurrent takes of one part give it to exactly one", async () => {
  const grants = createGrants()
  grants.create({ session: "s1", tabID: "t1", origin: GOOGLE, account: "personal", item: "i1", parts: ["otp"] })
  const results = await Promise.all([1, 2, 3].map(async () => grants.take({ ...use, part: "otp" })))
  assert.equal(results.filter(Boolean).length, 1)
})

test("flowMinutes: a number above 0 and at most 10; 3 by default", () => {
  assert.equal(parseFlowMinutes(undefined), 3)
  assert.equal(parseFlowMinutes(10), 10)
  assert.equal(parseFlowMinutes(0.5), 0.5)
  for (const bad of [0, -1, 11, "3", NaN, null]) assert.throws(() => parseFlowMinutes(bad), /flowMinutes/)
})

test("flowOf: every provider field must choose the same candidate with the same offer", () => {
  const offer = { parts: ["username", "password"], always: ["username", "password"], minutes: 3 }
  const candidate = (key: string, flow = offer): never => ({ key, account: "a", label: "A", state: "ready", methods: [], covered: false, flow }) as never
  const field = (name: string, ...candidates: unknown[]) => ({ name, source: { state: "choose" as const, candidates: candidates as never[], selected: (candidates[0] as { key: string }).key } })
  const same = [field("EMAIL", candidate("a:1")), field("PASSWORD", candidate("a:1"))]
  assert.equal(flowOf(same, () => undefined)?.candidate.key, "a:1")
  assert.equal(flowOf([field("EMAIL", candidate("a:1")), field("PASSWORD", candidate("a:2"))], () => undefined), undefined, "two items: no single sign-in")
  assert.equal(flowOf([field("EMAIL", candidate("a:1")), { name: "X", source: { state: "choose", candidates: [{ ...(candidate("a:1") as object), flow: undefined } as never], selected: "a:1" } }], () => undefined), undefined, "a field without an offer")
  assert.equal(flowOf([{ name: "TYPED" }], () => undefined), undefined, "a typed field alone")
  assert.equal(flowOf(same, (f) => (f.name === "PASSWORD" ? "a:9" : undefined)), undefined, "a pick that is not offered")
})

test("rules store: version 1 arrays are read as field rules and left alone; version 2 is written on the first change", async () => {
  const v1: SavedRule[] = [{ id: "r1", origin: GOOGLE, account: "personal", item: "i1", itemTitle: "Google", field: "password", via: "fill", created: 1 }]
  assert.deepEqual(migrateRules(v1), [{ ...v1[0], kind: "field" }])
  assert.deepEqual(migrateRules({ version: 2, rules: [{ ...v1[0], kind: "flow", parts: ["username"] }] })[0]!.kind, "flow")
  assert.deepEqual(migrateRules(undefined), [])
  assert.deepEqual(migrateRules("garbage"), [])
  assert.deepEqual(migrateRules([null, { id: 1 }, { id: "ok", account: "a" }]).map((rule) => rule.id), ["ok"], "malformed entries are dropped")

  const memory = new Map<string, unknown>([["rules.v1", v1]])
  let n = 0
  const rules = savedRules({ get: async (key) => memory.get(key), set: async (key, value) => void memory.set(key, value) }, () => `id${++n}`, () => 7)
  assert.equal((await rules.list())[0]!.id, "r1", "an old rule still shows and still covers")
  assert.ok(covering(await rules.list(), { account: "personal", item: "i1", origin: GOOGLE, field: "password", via: "fill" }))
  assert.equal(memory.has("rules.v2"), false, "reading writes nothing")
  const flow = await rules.addFlow({ account: "personal", item: "i1", itemTitle: "Google", origin: GOOGLE, parts: ["username", "password"] })
  assert.deepEqual([flow.kind, flow.parts, flow.via], ["flow", ["username", "password"], "fill"])
  assert.deepEqual(memory.get("rules.v1"), v1, "the v1 value is untouched")
  assert.equal((memory.get("rules.v2") as { version: number }).version, 2)
  assert.equal((await rules.list()).length, 2, "the old rule came along")
  assert.equal((await rules.addFlow({ account: "personal", item: "i1", origin: GOOGLE, parts: ["password"] })).id, flow.id, "one rule per account, item and site")
  assert.equal((await rules.addFlow({ account: "personal", item: "i1", origin: GOOGLE, parts: ["otp"] })).parts?.join(), "username,password,otp", "new parts join the rule")
  assert.equal(await rules.revoke(flow.id), true)
  assert.deepEqual((await rules.list()).map((rule) => rule.id), ["r1"])
})

test("a sign-in rule covers its parts for a fill of that item and site, and nothing else", () => {
  const rule: SavedRule = { id: "f", origin: GOOGLE, account: "personal", item: "i1", field: "sign-in", via: "fill", kind: "flow", parts: ["username", "password"], created: 1 }
  const ok = { account: "personal", item: "i1", origin: GOOGLE, field: "password", via: "fill" as const }
  assert.ok(covering([rule], ok))
  assert.ok(covering([rule], { ...ok, field: "username" }))
  for (const other of [{ field: "otp" }, { via: "get" as const }, { item: "i2" }, { account: "work" }, { origin: "http://accounts.google.com" }, { origin: "https://accounts.google.com.evil.test" }, { origin: undefined, name: "PASSWORD" }, { field: "Security answer" }]) {
    assert.equal(covering([rule], { ...ok, ...other }), undefined, JSON.stringify(other))
  }
})

// ---- the server against the fixture vault -----------------------------------------------------------------------------

let counter = 0
function vault(config: { confirmEveryUse?: boolean; alwaysAllowOtp?: boolean } = {}) {
  const personal = new OnePassword({ id: "personal", label: "Personal (1Password)", bin: join(root, "fixture-cli/op"), tokens: memoryTokens(), confirmEveryUse: config.confirmEveryUse, alwaysAllowOtp: config.alwaysAllowOtp })
  const stop = registerProvider({ kind: "1password", accepts: [1], source: `flow-${++counter}`, accounts: () => [personal as unknown as Account] })
  return { unlock: () => personal.unlock({ method: "serviceAccount", token: "ops_fixture_service_token" }), stop: async () => (stop(), personal.lock()) }
}

type Run = Awaited<ReturnType<typeof harness>>
const requests = (run: Run) => run.emitted.filter(([event]) => event === "requested").map(([, data]) => data as any)
const options = (extra: Record<string, unknown> = {}) => ({ audit: { file: join(dir, `audit-${++counter}.jsonl`) }, ...extra })
const other = (patch: Record<string, unknown>) => ({ ...context, ...patch }) as unknown as ToolContext
const field = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra })

/** Starts a fill and waits for its card (the nth request). */
async function card(run: Run, fields: unknown[], extra: Record<string, unknown> = {}, ctx: ToolContext = context, nth = requests(run).length) {
  const result = run.tools.get("fill")!.execute({ tabID: "tab_1", origin: GOOGLE, fields, reason: "Sign in", ...extra } as never, ctx)
  result.catch(() => undefined)
  for (let i = 0; i < 300 && requests(run).length <= nth; i++) await sleep(10)
  assert.ok(requests(run).length > nth, "a card was expected")
  return { result, request: requests(run)[nth] }
}

/** A fill that must complete without a card: returns the values the page would get. */
async function silent(run: Run, fields: unknown[], extra: Record<string, unknown> = {}, ctx: ToolContext = context) {
  const before = requests(run).length
  const result = run.tools.get("fill")!.execute({ tabID: "tab_1", origin: GOOGLE, fields, reason: "Sign in", ...extra } as never, ctx)
  let settled = false
  let failure: unknown
  result.then(() => (settled = true), (error) => ((failure = error), (settled = true)))
  for (let i = 0; i < 100 && !settled && requests(run).length === before; i++) await sleep(10)
  if (failure) throw failure
  assert.equal(requests(run).length, before, "no card")
  assert.ok(settled, "completed")
  return result as Promise<{ output: { script: string } }>
}

/** What the fill script would carry to the page, via the same evaluate hook the page goes through. */
function values(run: Run, done: { output: { script: string } }, tabID = "tab_1") {
  const event = { tool: "browser_evaluate", sessionID: "ses_test", input: { tabID, script: done.output.script } } as any
  run.hooks.get("tool.execute.before")!(event)
  return event.input.script as string
}

const allow = async (run: Run, request: any, extra: Record<string, unknown> = {}) => assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: {}, ...extra }), { accepted: true })
const grantsAudit = async (run: Run) => ((await run.handlers().overview({})) as { audit: any[] }).audit.reverse()
const noValue = (text: string) => [PW, EMAIL, "fixture-gwork-pw"].every((value) => !text.includes(value))

test("the first field's card offers the whole sign-in; a get does not; a code is never remembered by default", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    const candidate = first.request.fields[0].source.candidates[0]
    assert.deepEqual(candidate.flow, { parts: ["username", "password", "otp"], always: ["username", "password"], minutes: 3 })
    assert.equal(candidate.once, undefined)
    assert.ok(noValue(JSON.stringify(first.request)))
    await run.handlers().cancel({ requestID: first.request.requestID })
    await first.result.catch(() => undefined)

    const code = await card(run, [field("OTP", { kind: "otp" })], {}, context, 1)
    assert.equal(code.request.fields[0].source.candidates[0].once, true, "a code is never remembered by default")
    await run.handlers().cancel({ requestID: code.request.requestID })
    await code.result.catch(() => undefined)

    const viaGet = run.tools.get("get")!.execute({ fields: [field("EMAIL")], origin: GOOGLE, reason: "x" } as never, context)
    viaGet.catch(() => undefined)
    for (let i = 0; i < 100 && requests(run).length < 3; i++) await sleep(10)
    assert.equal(requests(run)[2].fields[0].source.candidates[0].flow, undefined, "a get never offers a sign-in")
    await run.handlers().cancel({ requestID: requests(run)[2].requestID })
    await viaGet.catch(() => undefined)
  } finally {
    await v.stop()
  }
})

test("Allow on the first field covers the rest of the login: password and code without a card, each once, and an unrelated field asks", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    await allow(run, first.request, { flow: true })
    const email = (await first.result) as { output: { script: string } }
    assert.ok(values(run, email).includes(EMAIL))

    const password = await silent(run, [field("PASSWORD")])
    assert.ok(values(run, password).includes(PW))
    const secondTry = await card(run, [field("PASSWORD")])
    assert.equal(requests(run).length, 2, "the password was used once; a retry asks")
    await run.handlers().cancel({ requestID: secondTry.request.requestID })
    await secondTry.result.catch(() => undefined)

    const code = await silent(run, [field("OTP", { kind: "otp" })])
    assert.match(values(run, code), /\["\d{6}"\]/, "a fresh code was read")
    const retryCode = await card(run, [field("OTP", { kind: "otp" })])
    await run.handlers().cancel({ requestID: retryCode.request.requestID })
    await retryCode.result.catch(() => undefined)

    const unrelated = await card(run, [field("RECOVERY", { field: "Recovery answer" })])
    assert.equal(unrelated.request.fields[0].source?.state !== "choose" || unrelated.request.fields[0].source.candidates[0].covered === false, true)
    await run.handlers().cancel({ requestID: unrelated.request.requestID })
    await unrelated.result.catch(() => undefined)

    const lines = await grantsAudit(run)
    const uses = lines.filter((line) => line.name !== "RECOVERY" && line.outcome !== "denied")
    assert.deepEqual(uses.map((line) => [line.name, line.outcome]), [["EMAIL", "allowed"], ["PASSWORD", "flow"], ["OTP", "flow"]])
    assert.equal(new Set(uses.map((line) => line.grant)).size, 1, "one grant id on every line of the sign-in")
    assert.ok(uses[0].grant, "the grant id is logged")
    assert.ok(noValue(JSON.stringify(run.emitted)) && noValue(JSON.stringify(lines)), "no value in an event or the audit")
    const counts = run.emitted.filter(([event]) => event === "flowed").map(([, data]) => data.count)
    assert.deepEqual(counts, [1, 2, 3], "the card that created the approval is told how many fields it served")
  } finally {
    await v.stop()
  }
})

test("a request for all three at once asks once, and the answered fields are spent", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const both = await card(run, [field("EMAIL"), field("PASSWORD")])
    assert.ok(both.request.fields.every((item: any) => item.source.candidates[0].flow))
    await allow(run, both.request, { flow: true })
    await both.result
    const again = await card(run, [field("PASSWORD")])
    await run.handlers().cancel({ requestID: again.request.requestID })
    await again.result.catch(() => undefined)
    const code = await silent(run, [field("OTP", { kind: "otp" })])
    assert.match(values(run, code), /\["\d{6}"\]/)
  } finally {
    await v.stop()
  }
})

test("'Only this field' (no flow), Deny and a failed card create nothing", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const one = await card(run, [field("EMAIL")])
    await allow(run, one.request, { flow: false })
    await one.result
    const next = await card(run, [field("PASSWORD")])
    await run.handlers().cancel({ requestID: next.request.requestID })
    await next.result.catch(() => undefined)

    const denied = await card(run, [field("EMAIL")])
    await run.handlers().cancel({ requestID: denied.request.requestID })
    await assert.rejects(denied.result, /denied/)
    const after = await card(run, [field("PASSWORD")])
    await run.handlers().cancel({ requestID: after.request.requestID })
    await after.result.catch(() => undefined)
    assert.equal(run.emitted.filter(([event]) => event === "flowed").length, 0)
  } finally {
    await v.stop()
  }
})

test("a grant is invisible to another session, another tab, another origin (lookalike, http) and to a get", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    await allow(run, first.request, { flow: true })
    await first.result
    let n = requests(run).length
    const refuse = async (title: string, make: () => Promise<{ request: any; result: Promise<unknown> }>) => {
      const asked = await make()
      assert.equal(requests(run).length, ++n, title)
      await run.handlers().cancel({ requestID: asked.request.requestID })
      await asked.result.catch(() => undefined)
    }
    await refuse("another session", () => card(run, [field("PASSWORD")], {}, other({ sessionID: "ses_other" }), n))
    await refuse("another tab", () => card(run, [field("PASSWORD")], { tabID: "tab_2" }, context, n))
    await refuse("a lookalike origin", () => card(run, [field("PASSWORD")], { origin: "https://accounts.google.com.evil.test" }, context, n))
    await refuse("http", () => card(run, [field("PASSWORD")], { origin: "http://accounts.google.com" }, context, n))
    await refuse("a get", async () => {
      const result = run.tools.get("get")!.execute({ fields: [field("PASSWORD")], origin: GOOGLE, reason: "x" } as never, context)
      result.catch(() => undefined)
      for (let i = 0; i < 100 && requests(run).length <= n; i++) await sleep(10)
      return { request: requests(run)[n], result }
    })
    await silent(run, [field("PASSWORD")])
  } finally {
    await v.stop()
  }
})

test("closing the tab, navigating it elsewhere, or a refused fill ends the approval; navigating within the origin does not", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const after = run.hooks.get("tool.execute.after")!
    const start = async (n: number) => {
      const first = await card(run, [field("EMAIL")], {}, context, n)
      await allow(run, first.request, { flow: true })
      await first.result
      return n + 1
    }
    const ends = async (n: number, label: string) => {
      const asked = await card(run, [field("PASSWORD")], {}, context, n)
      await run.handlers().cancel({ requestID: asked.request.requestID })
      await asked.result.catch(() => undefined)
      assert.ok(true, label)
      return n + 1
    }
    let n = await start(0)
    await after({ tool: "browser_navigate", status: "completed", input: { tabID: "tab_1", url: `${GOOGLE}/signin/v2` }, result: {} })
    await silent(run, [field("PASSWORD")])
    n = await start(n)
    await after({ tool: "browser_tabs_close", status: "completed", input: { tabID: "tab_1" }, result: {} })
    n = await ends(n, "tab closed")
    n = await start(n)
    await after({ tool: "browser_navigate", status: "completed", input: { tabID: "tab_1", url: "https://example.test/" }, result: {} })
    n = await ends(n, "navigated away")
    n = await start(n)
    await after({ tool: "browser_back", status: "completed", input: { tabID: "tab_1" }, result: {} })
    n = await ends(n, "back")
    n = await start(n)
    await after({ tool: "browser_evaluate", status: "completed", input: { tabID: "tab_1", script: "x" }, result: { content: JSON.stringify({ ok: false, reason: "origin", fields: [{ name: "PASSWORD", ok: false, reason: "origin" }] }) } })
    n = await ends(n, "the page refused the origin")
    n = await start(n)
    await after({ tool: "browser_navigate", status: "completed", input: { tabID: "tab_9", url: "https://example.test/" }, result: {} })
    await silent(run, [field("PASSWORD")])
    await after({ tool: "browser_navigate", status: "error", input: { tabID: "tab_1", url: "https://example.test/" }, error: new Error("x") })
  } finally {
    await v.stop()
  }
})

test("an approval expires after flowMinutes", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options({ flowMinutes: 0.003 }))
    const first = await card(run, [field("EMAIL")])
    assert.equal(first.request.fields[0].source.candidates[0].flow.minutes, 0.003)
    await allow(run, first.request, { flow: true })
    await first.result
    await sleep(250)
    const late = await card(run, [field("PASSWORD")])
    await run.handlers().cancel({ requestID: late.request.requestID })
    await late.result.catch(() => undefined)
  } finally {
    await v.stop()
  }
})

test("an account that confirms every use never offers or creates an approval, even if the card claims one", async () => {
  const v = vault({ confirmEveryUse: true })
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    assert.equal(first.request.fields[0].source.candidates[0].flow, undefined)
    await allow(run, first.request, { flow: true })
    await first.result
    const next = await card(run, [field("PASSWORD")])
    await run.handlers().cancel({ requestID: next.request.requestID })
    await next.result.catch(() => undefined)
    assert.equal(run.emitted.filter(([event]) => event === "flowed").length, 0)
  } finally {
    await v.stop()
  }
})

test("Always allow on a sign-in saves one rule for username and password; the code still asks, without Always allow; Revoke ends it", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    await allow(run, first.request, { flow: true, remember: true })
    await first.result
    const overview = (await run.handlers().overview({})) as { rules: SavedRule[] }
    assert.equal(overview.rules.length, 1, "one rule, not one per field")
    assert.deepEqual([overview.rules[0]!.kind, overview.rules[0]!.parts, overview.rules[0]!.origin, overview.rules[0]!.itemTitle, overview.rules[0]!.via], ["flow", ["username", "password"], GOOGLE, "Google (personal)", "fill"])
    assert.equal(run.emitted.filter(([event]) => event === "flowed").length, 0, "a saved rule needs no approval in memory")

    const email = await silent(run, [field("EMAIL")])
    assert.ok(values(run, email).includes(EMAIL))
    const password = await silent(run, [field("PASSWORD")])
    assert.ok(values(run, password).includes(PW))
    const both = await silent(run, [field("EMAIL"), field("PASSWORD")])
    assert.ok(values(run, both).includes(PW))

    const code = await card(run, [field("OTP", { kind: "otp" })])
    const candidate = code.request.fields[0].source.candidates[0]
    assert.equal(candidate.once, true, "the card hides Always allow for the code")
    assert.equal(candidate.flow, undefined, "no sign-in to offer: only the code is left")
    await allow(run, code.request, { remember: true })
    await code.result
    assert.equal(((await run.handlers().overview({})) as { rules: unknown[] }).rules.length, 1, "a submitted Always allow on a code saves nothing")
    const again = await card(run, [field("OTP", { kind: "otp" })])
    await run.handlers().cancel({ requestID: again.request.requestID })
    await again.result.catch(() => undefined)

    const lines = await grantsAudit(run)
    assert.deepEqual(lines.filter((line) => line.name !== "OTP" && line.outcome !== "denied").map((line) => line.outcome), ["always", "rule", "rule", "rule", "rule"])
    assert.equal(lines.find((line) => line.name === "OTP")!.outcome, "allowed")

    assert.equal(await (run.handlers().revoke({ id: overview.rules[0]!.id }) as Promise<{ accepted: boolean }>).then((reply) => reply.accepted), true)
    const asked = await card(run, [field("PASSWORD")])
    await run.handlers().cancel({ requestID: asked.request.requestID })
    await asked.result.catch(() => undefined)
  } finally {
    await v.stop()
  }
})

test("alwaysAllowOtp: the code joins the saved rule and its card offers Always allow", async () => {
  const v = vault({ alwaysAllowOtp: true })
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    assert.deepEqual(first.request.fields[0].source.candidates[0].flow.always, ["username", "password", "otp"])
    await allow(run, first.request, { flow: true, remember: true })
    await first.result
    assert.deepEqual(((await run.handlers().overview({})) as { rules: SavedRule[] }).rules[0]!.parts, ["username", "password", "otp"])
    const code = await silent(run, [field("OTP", { kind: "otp" })])
    assert.match(values(run, code), /\["\d{6}"\]/)
  } finally {
    await v.stop()
  }
})

test("concurrent requests do not double-spend one approval", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    await allow(run, first.request, { flow: true })
    await first.result
    const before = requests(run).length
    const calls = [1, 2, 3].map(() => {
      const result = run.tools.get("fill")!.execute({ tabID: "tab_1", origin: GOOGLE, fields: [field("PASSWORD")], reason: "Sign in" } as never, context)
      result.catch(() => undefined)
      return result
    })
    for (let i = 0; i < 100 && requests(run).length <= before; i++) await sleep(10)
    await sleep(50)
    assert.equal(requests(run).length, before + 1, "one was served silently; the next asked, and the rest wait their turn")
    for (let i = 0; i < 4; i++) {
      const open = requests(run).slice(before).find((request) => !run.emitted.some(([event, data]) => event === "resolved" && data.requestID === request.requestID))
      if (!open) break
      await run.handlers().cancel({ requestID: open.requestID })
      await sleep(30)
    }
    await Promise.allSettled(calls)
  } finally {
    await v.stop()
  }
})

test("injection: inside a valid approval, a page-supplied field label, another site or a get still asks, and the card says what for", async () => {
  const v = vault()
  try {
    await v.unlock()
    const run = await harness(options())
    const first = await card(run, [field("EMAIL")])
    await allow(run, first.request, { flow: true })
    await first.result
    const label = await card(run, [field("SECURITY", { field: "Security answer" })], {}, context, 1)
    assert.ok(label.request.fields[0].source?.state !== "choose" || !label.request.fields[0].source.candidates[0].covered)
    await run.handlers().cancel({ requestID: label.request.requestID })
    await label.result.catch(() => undefined)
    const evil = await card(run, [field("PASSWORD")], { origin: "https://accounts-google.com" }, context, 2)
    assert.ok(!evil.request.fields[0].source || evil.request.fields[0].source.state === "unavailable", "nothing is offered on a lookalike")
    await run.handlers().cancel({ requestID: evil.request.requestID })
    await evil.result.catch(() => undefined)
  } finally {
    await v.stop()
  }
})
