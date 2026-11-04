import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import provider from "../src/server.js"
import { Providers } from "../src/rpc.js"

const here = new URL("..", import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), "bf-rpc-"))
const state = join(dir, "state")
process.env.FIXTURE_STATE = state
const TOKEN = "ops_fixture_service_token"
const SECRETS = [TOKEN, "fixture-client-secret", "fixture-bw-master"]
type Handler = (input: unknown) => Promise<any>

async function start(options: Record<string, unknown> = {}) {
  let handlers!: Record<string, Handler>
  const events: unknown[] = []
  const stop = (await provider.setup({
    options: { accountsFile: join(dir, "accounts.json"), tokenStore: join(here, "fixture-cli/security"), bins: { "1password": join(here, "fixture-cli/op"), bitwarden: join(here, "fixture-cli/bw") }, ...options },
    rpc: { register: async (_: unknown, value: Record<string, Handler>) => ((handlers = value), { dispose: async () => {}, events: { emit: async (name: string, data: unknown) => void events.push([name, data]) } }) },
  } as unknown as Plugin.Context)) as () => void
  return { call: (name: string, input: unknown) => handlers[name]!(input), events, stop }
}
const clean = (value: unknown) => SECRETS.every((secret) => !JSON.stringify(value).includes(secret))

test("the RPC definition names every method the page calls, each with a closed input schema", () => {
  const methods = (Providers as unknown as { methods: Record<string, { input: { additionalProperties?: boolean } }> }).methods
  assert.deepEqual(Object.keys(methods).sort(), ["add", "confirm", "lock", "overview", "remove", "test", "unlock", "update", "verify"])
  for (const [name, method] of Object.entries(methods)) assert.equal(method.input.additionalProperties, false, name)
})

test("add through the RPC: replies and events never carry a credential, failures say why, and the account file is private", async () => {
  const run = await start()
  const bad = await run.call("add", { provider: "1password", settings: { label: "" }, secrets: { token: TOKEN } })
  assert.deepEqual([bad.ok, bad.error], [false, "name is required"])
  const nope = await run.call("add", { provider: "1password", settings: { label: "X", autoLockMinutes: 99999 }, secrets: { token: TOKEN } })
  assert.equal(nope.ok, false)
  const added = await run.call("add", { provider: "1password", settings: { label: "Agent vault", vaults: ["Agent"] }, secrets: { token: TOKEN } })
  assert.deepEqual([added.ok, added.id], [true, "agent-vault"])
  assert.ok(clean(added))
  const overview = await run.call("overview", {})
  assert.ok(clean(overview), "the overview has no credential")
  assert.equal(overview.accounts[0].credential, true, "only whether one is saved")
  assert.ok(clean(run.events), "events carry nothing")
  assert.ok(run.events.length > 0, "the page is told to reload")
  assert.equal(statSync(join(dir, "accounts.json")).mode & 0o777, 0o600)
  assert.ok(clean(readFileSync(join(dir, "accounts.json"), "utf8")))
  for (const file of readdirSync(dir)) if (statSync(join(dir, file)).isFile()) assert.ok(clean(readFileSync(join(dir, file), "utf8")), file)
  const tested = await run.call("test", { id: "agent-vault" })
  assert.deepEqual([tested.ok, tested.probe.ok, tested.probe.count], [true, true, 3])
  assert.ok(clean(tested))
  const gone = await run.call("remove", { id: "agent-vault" })
  assert.equal(gone.ok, true)
  assert.equal((await run.call("remove", { id: "agent-vault" })).ok, false)
  run.stop()
})

test("a wrong master password is reported without echoing it; the right one unlocks", async () => {
  const run = await start()
  const added = await run.call("add", { provider: "bitwarden", settings: { label: "Work" }, secrets: { clientId: "user.fixture-client", clientSecret: "fixture-client-secret" } })
  const wrong = await run.call("unlock", { id: added.id, password: "hunter2-not-it" })
  assert.equal(wrong.ok, false)
  assert.ok(!JSON.stringify(wrong).includes("hunter2-not-it"))
  assert.equal((await run.call("unlock", { id: added.id, password: "fixture-bw-master" })).ok, true)
  assert.ok(clean(await run.call("overview", {})))
  await run.call("remove", { id: added.id })
  run.stop()
})

test("cleanup", () => rmSync(dir, { recursive: true, force: true }))
