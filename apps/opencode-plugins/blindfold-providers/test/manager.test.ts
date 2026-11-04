// node --import tsx --test test/*.test.ts   (fixture CLIs only; every value is fake)
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import { accounts } from "../src/contract.js"
import { keychainStores } from "../src/keychain.js"
import { createManager } from "../src/manager.js"
import provider from "../src/server.js"

const here = new URL("..", import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), "bf-manager-"))
const state = join(dir, "state")
process.env.FIXTURE_STATE = state
const op = join(here, "fixture-cli/op")
const bw = join(here, "fixture-cli/bw")
const security = join(here, "fixture-cli/security")
const TOKEN = "ops_fixture_service_token"
const CLIENT = { clientId: "user.fixture-client", clientSecret: "fixture-client-secret" }
const SECRETS = [TOKEN, CLIENT.clientSecret, "fixture-bw-master", "fixture-op-master", "fixture-gh-pw", "fixture-holibob-pw"]

let n = 0
const make = (bins = { "1password": op, bitwarden: bw }) => createManager({ file: join(dir, `accounts-${++n}.json`), stores: keychainStores(security), bins })
const argv = () => (existsSync(join(state, "argv.log")) ? readFileSync(join(state, "argv.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]) : [])
const keychain = () => (existsSync(join(state, "keychain.json")) ? (JSON.parse(readFileSync(join(state, "keychain.json"), "utf8")) as Record<string, string>) : {})
const settings = (extra = {}) => ({ label: "Agent vault", allowedOrigins: ["github.com"], autoLockMinutes: 5, vaults: ["Agent"], ...extra })
const clean = (text: string) => SECRETS.every((secret) => !text.includes(secret))

test("add (1Password): the token goes to the keychain on stdin, the file holds settings only, and blindfold sees the account at once", async () => {
  const manager = make()
  const stop = manager.attach(undefined)
  assert.deepEqual(manager.accounts(), [])
  const { id } = await manager.add({ provider: "1password", settings: settings(), secrets: { token: TOKEN } })
  assert.equal(id, "agent-vault")
  assert.ok(argv().some((call) => call[0] === "security" && call[1] === "-i"), "written through security -i")
  assert.ok(argv().every((call) => clean(call.join(" "))), "no secret in any argv")
  assert.equal(keychain()["blindfold-op-agent-vault"], TOKEN)
  const file = readFileSync(manager.store.file, "utf8")
  assert.ok(clean(file), "no secret in the accounts file")
  assert.equal(statSync(manager.store.file).mode & 0o777, 0o600)
  assert.deepEqual(manager.accounts().map((account) => [account.id, account.label, account.allowedOrigins]), [["agent-vault", "Agent vault", ["github.com"]]])
  const view = (await manager.overview()).accounts[0]!
  assert.equal(view.credential, true)
  assert.equal(view.lock.state, "unlocked", "the saved token is the session")
  assert.ok(clean(JSON.stringify(await manager.overview())), "the overview never carries a credential")
  stop()
})

test("options win over stored accounts and are read-only; stored ones are kept beside them", async () => {
  const manager = make()
  const stop = manager.attach({ agent: { provider: "1password", label: "From config", bin: op, tokenStore: "memory" } })
  await manager.add({ provider: "1password", settings: settings({ label: "Mine" }), secrets: { token: TOKEN } })
  const view = await manager.overview()
  assert.deepEqual(view.accounts.map((account) => [account.id, account.source]).sort(), [["agent", "config"], ["mine", "stored"]])
  assert.deepEqual(manager.accounts().map((account) => account.label).sort(), ["From config", "Mine"])
  await assert.rejects(manager.update({ id: "agent", settings: { label: "x" } }), /opencode\.json/)
  await assert.rejects(manager.remove("agent"), /opencode\.json/)
  // An id used in the options cannot be taken by a new account; a same-named stored account yields to the option.
  const second = await manager.add({ provider: "1password", settings: settings({ label: "Agent" }), secrets: { token: TOKEN } })
  assert.equal(second.id, "agent-2")
  stop()
  const again = make()
  const off = again.attach({ mine: { provider: "bitwarden", label: "Option wins", bin: bw, appDataDir: join(dir, "bw-opt") } })
  again.store.write({ version: 1, accounts: { mine: { provider: "1password", label: "Stored loses", enabled: true } }, confirmed: {} })
  await again.overview()
  assert.deepEqual(again.accounts().map((account) => [account.id, account.label, account.kind]), [["mine", "Option wins", "bitwarden"]])
  off()
})

test("live re-registration: add, edit, disable, enable and remove change what blindfold finds, with no setup call", async () => {
  const file = join(dir, "live.json")
  const stop = (await provider.setup({ options: { accountsFile: file, tokenStore: security, bins: { "1password": op, bitwarden: bw } } } as unknown as Plugin.Context)) as () => void
  assert.deepEqual(accounts(), [])
  const manager = (globalThis as unknown as Record<symbol, { manager: ReturnType<typeof make> }>)[Symbol.for("opencode-plugins.blindfold.providers.manager.v1")]!.manager
  const { id } = await manager.add({ provider: "1password", settings: settings({ label: "Live" }), secrets: { token: TOKEN } })
  assert.deepEqual(accounts().map((account) => account.id), [id])
  const first = accounts()[0]!
  await manager.update({ id, settings: { allowedOrigins: ["*.example.com"] } })
  assert.deepEqual(accounts()[0]!.allowedOrigins, ["*.example.com"])
  assert.notEqual(accounts()[0], first, "an edit rebuilds that account")
  await manager.update({ id, settings: { enabled: false } })
  assert.deepEqual(accounts(), [])
  assert.equal((await manager.overview()).accounts[0]!.lock.state, "disabled")
  await manager.update({ id, settings: { enabled: true, confirmEveryUse: true } })
  assert.equal(accounts()[0]!.confirmEveryUse, true)
  await manager.remove(id)
  assert.deepEqual(accounts(), [])
  assert.deepEqual(keychain()["blindfold-op-live"], undefined, "the keychain item is gone")
  stop()
  assert.deepEqual(accounts(), [])
})

test("an edit leaves the other accounts unlocked", async () => {
  const manager = make()
  const stop = manager.attach(undefined)
  const a = await manager.add({ provider: "1password", settings: settings({ label: "One" }), secrets: { token: TOKEN } })
  const b = await manager.add({ provider: "bitwarden", settings: { label: "Two", autoLockMinutes: 5 }, secrets: CLIENT })
  await manager.unlock(b.id, "fixture-bw-master")
  assert.equal((await manager.overview()).accounts.find((account) => account.id === b.id)!.lock.state, "unlocked")
  await manager.update({ id: a.id, settings: { label: "One renamed" } })
  assert.equal((await manager.overview()).accounts.find((account) => account.id === b.id)!.lock.state, "unlocked")
  stop()
})

test("validation: nothing is saved for a bad request, and no message echoes the input", async () => {
  const manager = make()
  const stop = manager.attach(undefined)
  const before = JSON.stringify(keychain())
  const bad = async (input: Parameters<typeof manager.add>[0], pattern: RegExp) =>
    assert.rejects(manager.add(input), (error: Error) => pattern.test(error.message) && clean(error.message) && !error.message.includes("not-a-secret-value"))
  await bad({ provider: "keepass", settings: settings(), secrets: { token: TOKEN } }, /provider/)
  await bad({ provider: "1password", settings: settings({ label: "" }), secrets: { token: TOKEN } }, /name is required/)
  await bad({ provider: "1password", settings: settings({ allowedOrigins: ["https://ok.test", "no spaces allowed"] }), secrets: { token: TOKEN } }, /not a site/)
  await bad({ provider: "1password", settings: settings({ autoLockMinutes: 0 }), secrets: { token: TOKEN } }, /auto-lock/)
  await bad({ provider: "1password", settings: settings({ autoLockMinutes: "5" }), secrets: { token: TOKEN } }, /auto-lock/)
  await bad({ provider: "1password", settings: settings(), secrets: {} }, /token is required/)
  await bad({ provider: "1password", settings: settings(), secrets: { token: "not-a-secret-value\nsecond line" } }, /single line/)
  await bad({ provider: "1password", settings: settings(), secrets: { token: 'has "quote' } }, /keychain/)
  await bad({ provider: "bitwarden", settings: { label: "bw" }, secrets: { clientId: "user.x" } }, /API key is required/)
  await bad({ provider: "bitwarden", settings: { label: "bw", organizationId: "bad id!" }, secrets: CLIENT }, /organisation id/)
  assert.deepEqual((await manager.overview()).accounts, [])
  assert.equal(JSON.stringify(keychain()), before, "a rejected add leaves nothing in the keychain")
  stop()
})

test("connection test (1Password): ok with a count and titles, then each failure maps to a named reason", async () => {
  const manager = make()
  const stop = manager.attach(undefined)
  const logged = existsSync(join(state, "env.log")) ? readFileSync(join(state, "env.log"), "utf8").trim().split("\n").length : 0
  const { id } = await manager.add({ provider: "1password", settings: settings(), secrets: { token: TOKEN } })
  const ok = await manager.test(id)
  assert.equal(ok.ok, true)
  assert.equal(ok.count, 3, "Agent vault logins")
  assert.ok(ok.items!.some((item) => item.title === "GitHub"))
  assert.ok(clean(JSON.stringify(ok)), "titles and a count, no value")
  const envs = readFileSync(join(state, "env.log"), "utf8").trim().split("\n").slice(logged).map((line) => JSON.parse(line) as { tool: string; bio: string | null; service: boolean })
  assert.ok(envs.filter((entry) => entry.tool === "op").every((entry) => entry.bio === "false" && entry.service), "app integration off, service account token on, for every op call")
  const verified = await manager.verify(id, ok.items!.find((item) => item.title === "GitHub")!.id)
  assert.deepEqual(verified, { ok: true, code: "ok" }, "ok or not, never the value")
  assert.equal((await manager.overview()).accounts[0]!.verified?.probe.ok, true)

  const mode = async (value: string, timeout?: number) => {
    process.env.FIXTURE_OP_MODE = value
    try {
      return await manager.test(id, timeout)
    } finally {
      delete process.env.FIXTURE_OP_MODE
    }
  }
  assert.equal((await mode("rate_limit")).code, "rate_limited")
  const slow = await mode("hang", 700)
  assert.equal(slow.code, "timeout", "no answer: the app may be asking")
  assert.equal((await mode("app_prompt")).code, "app_prompt")

  await manager.update({ id, settings: { vaults: ["Nope"] } })
  const vault = await manager.test(id)
  assert.deepEqual([vault.code, vault.detail], ["vault_not_found", "Nope"])

  await manager.update({ id, secrets: { token: "ops_wrong_token_value" } })
  await manager.update({ id, settings: { vaults: [] } })
  const rejected = await manager.test(id)
  assert.equal(rejected.code, "token_rejected")
  assert.ok(!JSON.stringify(rejected).includes("ops_wrong_token_value"))

  const noCli = make({ "1password": join(dir, "no-such-op"), bitwarden: bw })
  const off = noCli.attach(undefined)
  const missing = await noCli.add({ provider: "1password", settings: settings(), secrets: { token: TOKEN } })
  assert.equal((await noCli.test(missing.id)).code, "cli_missing")
  off()

  await manager.remove(id)
  assert.equal((await manager.test(id)).ok, false)
  const none = make()
  const dropped = none.attach(undefined)
  const bare = await none.add({ provider: "1password", settings: settings({ label: "Bare" }), secrets: { token: TOKEN } })
  await keychainStores(security).opToken.delete(bare.id)
  assert.equal((await none.test(bare.id)).code, "no_token")
  assert.equal((await none.overview()).accounts[0]!.credential, false)
  dropped()
  stop()
})

test("Bitwarden: the saved API key logs in, so unlocking takes the master password only; a locked account tests as locked", async () => {
  const manager = make()
  const stop = manager.attach(undefined)
  const { id } = await manager.add({ provider: "bitwarden", settings: { label: "Work bw", organizationId: "org-work", autoLockMinutes: 5 }, secrets: CLIENT })
  assert.equal(keychain()[`blindfold-bw-secret-${id}`], CLIENT.clientSecret)
  assert.deepEqual(await manager.accounts()[0]!.status(), { state: "locked", methods: ["masterPassword"] })
  assert.equal((await manager.test(id)).code, "locked")
  await assert.rejects(manager.unlock(id, "wrong password value"), (error: Error) => /Invalid master password/.test(error.message) && !error.message.includes("wrong password value"))
  await manager.unlock(id, "fixture-bw-master")
  const view = (await manager.overview()).accounts[0]!
  assert.equal(view.lock.state, "unlocked")
  assert.ok(view.lock.expiresAt! - Date.now() <= 5 * 60_000 + 1000, "auto-lock follows the account setting")
  const probe = await manager.test(id)
  assert.deepEqual([probe.ok, probe.count], [true, 2])
  await manager.lock(id)
  assert.equal((await manager.overview()).accounts[0]!.lock.state, "locked")
  assert.ok(clean(JSON.stringify(await manager.overview())))
  await manager.remove(id)
  assert.deepEqual(Object.keys(keychain()).filter((key) => key.includes(id)), [])
  stop()
})

test("checklist inputs: tools are looked up by name and version only; a missing CLI shows as not installed; the manual step persists", async () => {
  const manager = make()
  const stop = manager.attach(undefined)
  const before = argv().length
  const view = await manager.overview({ fresh: true })
  assert.equal(view.tools["1password"].installed, true)
  assert.match(view.tools["1password"].version ?? "", /fixture/)
  const ran = argv().slice(before).filter((call) => call[0] === "op" || call[0] === "bw")
  assert.ok(ran.every((call) => call.length === 2 && call[1] === "--version"), "only --version was run")
  const gone = make({ "1password": join(dir, "no-such-op"), bitwarden: bw })
  const off = gone.attach(undefined)
  assert.equal((await gone.overview({ fresh: true })).tools["1password"].installed, false)
  off()
  assert.equal(view.confirmed.opAppIntegrationOff, undefined)
  manager.confirm("opAppIntegrationOff", true)
  assert.equal((await manager.overview()).confirmed.opAppIntegrationOff, true)
  assert.equal(make().attach(undefined) instanceof Function, true)
  assert.throws(() => manager.confirm("other" as never, true), /unknown step/)
  stop()
})

test("a bad option still fails setup by name, and the stored accounts keep working", async () => {
  const manager = make()
  assert.throws(() => manager.attach({ Bad: { provider: "bitwarden" } }), /blindfold-providers accounts/)
  assert.equal(manager.attached, 0)
})

test("an options change loaded before the old instance is cleaned up is honoured: new CLI, new accounts file", async () => {
  const stores = keychainStores(security)
  const old = createManager({ file: join(dir, "old.json"), stores, bins: { "1password": join(dir, "no-such-op") } })
  const first = old.attach(undefined)
  assert.equal((await old.overview({ fresh: true })).tools["1password"].installed, false)
  const second = old.attach(undefined, { file: join(dir, "new.json"), stores, bins: { "1password": op } })
  const view = await old.overview({ fresh: true })
  assert.equal(view.tools["1password"].installed, true)
  assert.equal(view.file, join(dir, "new.json"))
  first()
  assert.equal(old.attached, 1, "the old instance leaving does not undo it")
  assert.equal((await old.overview({ fresh: true })).tools["1password"].installed, true)
  second()
})

test("cleanup", () => rmSync(dir, { recursive: true, force: true }))
