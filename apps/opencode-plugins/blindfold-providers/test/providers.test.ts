// node --import tsx --test test/*.test.ts   (fixture CLIs only; every value is fake)
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Bitwarden } from "../src/bitwarden.js"
import { LockedError, accounts, originMatches, patternMatches } from "../src/contract.js"
import { keychainTokens, memoryTokens } from "../src/keychain.js"
import { OnePassword } from "../src/onepassword.js"

const here = new URL("..", import.meta.url).pathname
const state = mkdtempSync(join(tmpdir(), "bf-providers-"))
process.env.FIXTURE_STATE = state
const op = join(here, "fixture-cli/op")
const bw = join(here, "fixture-cli/bw")
const security = join(here, "fixture-cli/security")

const SECRETS = ["fixture-op-master", "fixture-bw-master", "ops_fixture_service_token", "fixture-client-secret", "fixture-google-pw", "fixture-gwork-pw", "fixture-holibob-pw"]
const log = (name: string) => (existsSync(join(state, name)) ? readFileSync(join(state, name), "utf8").trim().split("\n").filter(Boolean) : [])
const argv = () => log("argv.log").map((line) => JSON.parse(line) as string[])
const SERVICE_TOKEN = "ops_fixture_service_token"

const agent = (tokens = memoryTokens(), extra = {}) => new OnePassword({ id: "agent", label: "Agent (1Password)", bin: op, tokens, ...extra })
const work = (extra = {}) => new Bitwarden({ id: "work", label: "Work (Bitwarden)", bin: bw, appDataDir: join(state, "bw-work"), organizationId: "org-work", ...extra })

test("origins: subdomain yes, lookalike no, scheme and port must agree; patterns", () => {
  assert.ok(originMatches("https://holibob.tech", "https://admin.holibob.tech"))
  assert.ok(!originMatches("https://holibob.tech", "https://evil-holibob.tech"))
  assert.ok(!originMatches("https://holibob.tech", "http://holibob.tech"))
  assert.ok(!originMatches("https://admin.holibob.tech", "https://holibob.tech"))
  assert.ok(patternMatches("*.holibob.tech", "https://admin.holibob.tech"))
  assert.ok(patternMatches("*.holibob.tech", "https://holibob.tech"))
  assert.ok(!patternMatches("*.holibob.tech", "https://holibob.tech.evil.test"))
  assert.ok(patternMatches("accounts.google.com", "https://accounts.google.com"))
  assert.ok(!patternMatches("accounts.google.com", "https://mail.google.com"))
  assert.ok(!patternMatches("accounts.google.com", "http://accounts.google.com"))
  assert.ok(patternMatches("http://localhost:3000", "http://localhost:3000"))
  assert.ok(!patternMatches("http://localhost:3000", "http://localhost:3001"))
})

test("a service account with no saved token is locked and asks for the token; nothing talks to the app", async () => {
  const account = agent()
  assert.deepEqual(await account.status(), { state: "locked", methods: ["serviceAccount"] })
  await assert.rejects(account.findByOrigin("https://github.com"), LockedError)
  await assert.rejects(account.unlock({ method: "serviceAccount", token: "ops_wrong_token_123" }), (error: Error) => /token was rejected/.test(error.message) && !error.message.includes("ops_wrong_token_123"))
  assert.equal((await account.status()).state, "locked")
})

test("service account: token unlocks, is saved to the keychain, and the next process unlocks silently", async () => {
  const tokens = keychainTokens(security)
  const first = agent(tokens)
  assert.equal((await first.unlock({ method: "serviceAccount", token: SERVICE_TOKEN })).state, "unlocked")
  assert.ok(argv().some((a) => a[0] === "security" && a[1] === "-i"), "written through security -i")
  assert.ok(!argv().some((a) => a[0] === "security" && a.some((x) => x.includes("ops_"))), "the token is never an argument")
  const second = agent(tokens)
  assert.equal((await second.status()).state, "unlocked", "silent: the token comes from the keychain")
  const items = await second.findByOrigin("https://github.com")
  assert.equal(items.length, 1)
  assert.equal(await second.read(items[0]!, "password"), "fixture-gh-pw")
  await second.forget()
  assert.deepEqual(await agent(tokens).status(), { state: "locked", methods: ["serviceAccount"] })
})

test("the service account sees only its vault, and never an item value in a listing", async () => {
  const account = agent()
  await account.unlock({ method: "serviceAccount", token: SERVICE_TOKEN })
  assert.equal((await account.findByOrigin("https://bank.example")).length, 0)
  const google = await account.findByOrigin("https://accounts.google.com")
  assert.equal(google.length, 1)
  assert.ok(!JSON.stringify(google).includes("fixture-google-pw"))
  assert.equal(await account.read(google[0]!, "username"), "personal.fixture@example.test")
  assert.match(await account.read(google[0]!, "otp"), /^\d{6}$/)
})

test("the app integration is off on every op call, whatever the service environment says, and no prompt ever happens", async () => {
  process.env.OP_BIOMETRIC_UNLOCK_ENABLED = "true"
  process.env.OP_SESSION_inherited = "inherited-session"
  try {
    const account = agent()
    await account.unlock({ method: "serviceAccount", token: SERVICE_TOKEN })
    await account.findByOrigin("https://github.com")
    const calls = log("env.log").map((line) => JSON.parse(line) as { tool: string; bio: string | null; inheritedSession: boolean })
    const ops = calls.filter((call) => call.tool === "op")
    assert.ok(ops.length > 3)
    assert.ok(ops.every((call) => call.bio === "false" && !call.inheritedSession))
  } finally {
    delete process.env.OP_BIOMETRIC_UNLOCK_ENABLED
    delete process.env.OP_SESSION_inherited
  }
  assert.equal(log("app-prompts.log").length, 0)
})

test("item lists are cached for the session: one listing serves many origins", async () => {
  const account = agent()
  await account.unlock({ method: "serviceAccount", token: SERVICE_TOKEN })
  const before = argv().filter((a) => a[0] === "op" && a[1] === "item" && a[2] === "list").length
  await account.findByOrigin("https://github.com")
  await account.findByOrigin("https://accounts.google.com")
  await account.findByOrigin("https://bank.example")
  assert.equal(argv().filter((a) => a[0] === "op" && a[1] === "item" && a[2] === "list").length, before)
})

test("master password (documented option): signin on stdin with the app integration off, then lists the whole account", async () => {
  const account = new OnePassword({ id: "personal", label: "Personal (1Password)", bin: op, method: "masterPassword", address: "my.1password.com" })
  assert.deepEqual(await account.status(), { state: "locked", methods: ["masterPassword"] })
  await assert.rejects(account.unlock({ method: "masterPassword", password: "wrong-guess-123" }), (error: Error) => /Unauthorized/.test(error.message) && !error.message.includes("wrong-guess-123"))
  assert.equal((await account.unlock({ method: "masterPassword", password: "fixture-op-master" })).state, "unlocked")
  assert.equal((await account.findByOrigin("https://bank.example")).length, 1)
  await account.lock()
  assert.equal((await account.status()).state, "locked")
})

test("op:// references keep working (what blindfold's secrets option does), as the service account", async () => {
  const account = agent()
  await account.unlock({ method: "serviceAccount", token: SERVICE_TOKEN })
  const { item, field } = await account.resolve("op://Agent/GitHub/password")
  assert.equal(await account.read(item, field), "fixture-gh-pw")
  const otp = await account.resolve("op://Agent/GitHub/one-time password?attribute=otp")
  assert.match(await account.read(otp.item, otp.field), /^\d{6}$/)
})

test("Bitwarden: logged out asks for the API key; unlock = API key login + master password; then the vault", async () => {
  const account = work()
  assert.deepEqual(await account.status(), { state: "locked", methods: ["apiKey"] })
  await assert.rejects(account.unlock({ method: "apiKey", clientId: "user.fixture-client", clientSecret: "wrong-secret-xyz", password: "fixture-bw-master" }), (error: Error) => !error.message.includes("wrong-secret-xyz") && !error.message.includes("fixture-bw-master"))
  await assert.rejects(account.unlock({ method: "apiKey", clientId: "user.fixture-client", clientSecret: "fixture-client-secret", password: "wrong-master-12" }), (error: Error) => /Invalid master password/.test(error.message) && !error.message.includes("wrong-master-12"))
  assert.equal((await account.unlock({ method: "apiKey", clientId: "user.fixture-client", clientSecret: "fixture-client-secret", password: "fixture-bw-master" })).state, "unlocked")
  assert.ok(argv().some((a) => a[0] === "bw" && a[1] === "sync"))
  await account.lock()
  assert.deepEqual(await account.status(), { state: "locked", methods: ["masterPassword"] }, "logged in: only the master password is needed now")
})

test("Bitwarden: origin search returns references only, scoped to the organisation; lookalike and http do not match; otp", async () => {
  const account = work()
  assert.equal((await account.unlock({ method: "masterPassword", password: "fixture-bw-master" })).state, "unlocked")
  const holibob = await account.findByOrigin("https://admin.holibob.tech")
  assert.equal(holibob.length, 1)
  assert.ok(!JSON.stringify(holibob).includes("fixture-holibob-pw"), "bw list output (which carries values) never leaves the provider")
  assert.equal(await account.read(holibob[0]!, "username"), "work.fixture@holibob.test")
  assert.match(await account.read(holibob[0]!, "otp"), /^\d{6}$/)
  assert.equal((await account.findByOrigin("https://evil-holibob.tech")).length, 0)
  assert.equal((await account.findByOrigin("http://admin.holibob.tech")).length, 0)
  const scoped = work({ organizationId: "org-other" })
  await scoped.unlock({ method: "masterPassword", password: "fixture-bw-master" })
  assert.equal((await scoped.findByOrigin("https://admin.holibob.tech")).length, 0)
  await scoped.lock()
  await account.lock()
})

test("auto-lock: the idle timer drops the session and runs bw lock; the next read is LockedError", async () => {
  const account = work({ autoLockMinutes: 0.01 })
  await account.unlock({ method: "masterPassword", password: "fixture-bw-master" })
  const locks = () => argv().filter((a) => a[0] === "bw" && a[1] === "lock").length
  const before = locks()
  // Polled, not slept: the CLI fixtures are slow on a busy machine.
  for (let i = 0; i < 100 && locks() === before; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(locks(), before + 1, "bw lock ran")
  assert.equal((await account.status()).state === "unlocked", false)
  await assert.rejects(account.findByOrigin("https://admin.holibob.tech"), LockedError)
})

test("a use of the account moves its lock time later", async () => {
  const account = work({ autoLockMinutes: 5 })
  await account.unlock({ method: "masterPassword", password: "fixture-bw-master" })
  const expires = async () => ((await account.status()) as { expiresAt: number }).expiresAt
  const first = await expires()
  await new Promise((resolve) => setTimeout(resolve, 30))
  await account.read({ account: "work", id: "bw1", title: "x", origins: [], hasOtp: false, fields: [] }, "username")
  assert.ok((await expires()) > first)
  await account.lock()
})

test("a vendor-side expiry surfaces as LockedError and clears local state", async () => {
  const account = new OnePassword({ id: "p2", label: "P2", bin: op, method: "masterPassword" })
  await account.unlock({ method: "masterPassword", password: "fixture-op-master" })
  const [item] = await account.findByOrigin("https://github.com")
  process.env.FIXTURE_OP_IDLE_MS = "1"
  await new Promise((resolve) => setTimeout(resolve, 20))
  await assert.rejects(account.read(item!, "password"), LockedError)
  delete process.env.FIXTURE_OP_IDLE_MS
  assert.equal((await account.status()).state, "locked")
})

test("a token with unusual characters is kept in memory, not written to the keychain", async () => {
  const tokens = keychainTokens(security)
  assert.equal(await tokens.set("odd", 'ops_"quoted" token'), false)
  assert.equal(await tokens.get("odd"), undefined)
})

test("accounts() lists every registered account once", () => {
  assert.deepEqual(accounts(), [])
})

test("no secret ever appeared in any CLI argv", () => {
  const all = readFileSync(join(state, "argv.log"), "utf8")
  for (const secret of SECRETS) assert.ok(!all.includes(secret), `argv must not carry ${secret.slice(0, 6)}...`)
  rmSync(state, { recursive: true, force: true })
})
