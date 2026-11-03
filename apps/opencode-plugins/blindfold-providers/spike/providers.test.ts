// node --experimental-strip-types --test spike/providers.test.ts   (fixture CLIs only; fake values)
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LockedError } from "./contract.ts"
import { Bitwarden, OnePassword, route } from "./providers.ts"

const here = new URL(".", import.meta.url).pathname
const state = mkdtempSync(join(tmpdir(), "bf-providers-"))
process.env.FIXTURE_STATE = state
const op = join(here, "fixture-cli/op")
const bw = join(here, "fixture-cli/bw")

// The secrets the user would type into the card, and the item values. Fake.
const SECRETS = ["fixture-op-master", "fixture-bw-master", "ops_fixture_service_token", "fixture-client-secret", "fixture-google-pw", "fixture-gwork-pw", "fixture-holibob-pw"]

const personal = new OnePassword({ id: "personal", label: "Personal (1Password)", bin: op })
const agent = new OnePassword({ id: "agent", label: "Agent vault (1Password service account)", bin: op })
const work = new Bitwarden({ id: "work", label: "Work (Bitwarden)", bin: bw, appDataDir: join(state, "bw-work"), organizationId: "org-work" })

test("every account starts locked and says how it can be unlocked", async () => {
  assert.deepEqual(await personal.status(), { state: "locked", methods: ["serviceAccount", "masterPassword"] })
  assert.deepEqual(await work.status(), { state: "locked", methods: ["apiKey"] })
  await assert.rejects(personal.findByOrigin("https://accounts.google.com"), LockedError)
})

test("wrong master password: an error that carries the CLI's reason, never the value", async () => {
  await assert.rejects(personal.unlock({ method: "masterPassword", password: "wrong-guess-123" }), (e: Error) => /Unauthorized/.test(e.message) && !e.message.includes("wrong-guess-123"))
})

test("unlock without biometrics: master password (1Password), service account (1Password), API key + password (Bitwarden)", async () => {
  assert.equal((await personal.unlock({ method: "masterPassword", password: "fixture-op-master" })).state, "unlocked")
  assert.equal((await agent.unlock({ method: "serviceAccount", token: "ops_fixture_service_token" })).state, "unlocked")
  assert.equal((await work.unlock({ method: "apiKey", clientId: "user.fixture-client", clientSecret: "fixture-client-secret", password: "fixture-bw-master" })).state, "unlocked")
})

test("the service account sees only its vault", async () => {
  const bank = await agent.findByOrigin("https://bank.example")
  assert.equal(bank.length, 0)
  assert.equal((await personal.findByOrigin("https://bank.example")).length, 1)
})

test("origin search returns references only; read returns the value; otp is 6 digits", async () => {
  const items = await personal.findByOrigin("https://accounts.google.com")
  assert.equal(items.length, 1)
  assert.ok(!JSON.stringify(items).includes("fixture-google-pw"))
  assert.equal(await personal.read(items[0]!, "password"), "fixture-google-pw")
  assert.match(await personal.read(items[0]!, "otp"), /^\d{6}$/)
  const holibob = await work.findByOrigin("https://admin.holibob.tech")
  assert.ok(!JSON.stringify(holibob).includes("fixture-holibob-pw"), "bw list output (which carries values) never leaves the provider")
  assert.match(await work.read(holibob[0]!, "otp"), /^\d{6}$/)
  assert.equal((await work.findByOrigin("https://evil-holibob.tech")).length, 0, "lookalike host does not match")
  assert.equal((await work.findByOrigin("http://admin.holibob.tech")).length, 0, "http does not match an https item")
})

test("op:// references keep working (what blindfold's secrets option does today)", async () => {
  const { item, field } = await agent.resolve("op://Agent/GitHub/password")
  assert.equal(await agent.read(item, field), "fixture-gh-pw")
  const otp = await agent.resolve("op://Agent/GitHub/one-time password?attribute=otp")
  assert.match(await agent.read(otp.item, otp.field), /^\d{6}$/)
})

test("routing: one holder fills, two holders ask with labels, the choice is remembered, rules can exclude", async () => {
  const remembered = new Map<string, string>()
  const all = [personal, work]
  const anywhere = () => true
  assert.deepEqual(await route("https://admin.holibob.tech", all, anywhere, remembered), { kind: "account", account: "work" })
  const google = await route("https://accounts.google.com", all, anywhere, remembered)
  assert.equal(google.kind, "ask")
  assert.deepEqual(google.kind === "ask" && google.candidates.map((c) => c.label), ["Personal (1Password)", "Work (Bitwarden)"])
  remembered.set("https://accounts.google.com", "personal")
  assert.deepEqual(await route("https://accounts.google.com", all, anywhere, remembered), { kind: "account", account: "personal" })
  // Rule: *.holibob.tech is work-only, and work never fills outside it.
  const rules = (account: string, origin: string) => (new URL(origin).hostname.endsWith("holibob.tech") ? account === "work" : account !== "work")
  assert.deepEqual(await route("https://accounts.google.com", all, rules, new Map()), { kind: "account", account: "personal" })
  assert.deepEqual(await route("https://bank.example", [work], rules, new Map()), { kind: "none" })
})

test("auto-lock drops the session; the next read is LockedError, not a stale session", async () => {
  const short = new OnePassword({ id: "short", label: "Short", bin: op, autoLockMinutes: 0.001 })
  await short.unlock({ method: "masterPassword", password: "fixture-op-master" })
  await new Promise((r) => setTimeout(r, 150))
  assert.equal((await short.status()).state, "locked")
  await assert.rejects(short.findByOrigin("https://github.com"), LockedError)
})

test("a session that expired on the vendor side surfaces as LockedError and clears local state", async () => {
  process.env.FIXTURE_OP_IDLE_MS = "1"
  await new Promise((r) => setTimeout(r, 20))
  await assert.rejects(personal.findByOrigin("https://github.com"), LockedError)
  assert.equal((await personal.status()).state, "locked")
  delete process.env.FIXTURE_OP_IDLE_MS
})

test("no secret ever appeared in any CLI argv", async () => {
  await work.lock()
  await agent.lock()
  const argv = readFileSync(join(state, "argv.log"), "utf8")
  for (const secret of SECRETS) assert.ok(!argv.includes(secret), "argv must not carry a secret")
  rmSync(state, { recursive: true, force: true })
})
