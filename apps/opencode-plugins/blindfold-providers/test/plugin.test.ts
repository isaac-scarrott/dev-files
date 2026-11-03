import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import { parseAccounts } from "../src/config.js"
import { accounts } from "../src/contract.js"
import { memoryTokens } from "../src/keychain.js"
import provider from "../src/server.js"

const here = new URL("..", import.meta.url).pathname
const state = mkdtempSync(join(tmpdir(), "bf-plugin-"))
process.env.FIXTURE_STATE = state
const options = {
  accounts: {
    agent: { provider: "1password", label: "Agent (1Password)", bin: join(here, "fixture-cli/op"), vaults: [] },
    work: { provider: "bitwarden", label: "Work (Bitwarden)", bin: join(here, "fixture-cli/bw"), appDataDir: join(state, "bw"), organizationId: "org-work", allowedOrigins: ["*.holibob.tech"], autoLockMinutes: 5 },
  },
}
const setup = (opts: Record<string, unknown> = options) => provider.setup({ options: opts } as unknown as Plugin.Context) as Promise<() => void>

test("option errors name the option", () => {
  const bad = (accounts: unknown) => assert.throws(() => parseAccounts({ accounts }, memoryTokens()), /blindfold-providers accounts/)
  bad([])
  bad({ Bad: { provider: "bitwarden" } })
  bad({ ok: { provider: "keepass" } })
  bad({ ok: { provider: "1password", unlock: "touchid" } })
  bad({ ok: { provider: "bitwarden", autoLockMinutes: -1 } })
  bad({ ok: { provider: "bitwarden", allowedOrigins: "x" } })
})

test("setup registers both vendors; allowedOrigins is the account's fence; sessions are shared across locations", async () => {
  const stopA = await setup()
  const stopB = await setup()
  const list = accounts()
  assert.deepEqual(list.map((a) => [a.id, a.kind]).sort(), [["agent", "1password"], ["work", "bitwarden"]])
  assert.deepEqual(list.find((a) => a.id === "work")!.allowedOrigins, ["*.holibob.tech"])
  const work = list.find((a) => a.id === "work")!
  await work.unlock({ method: "apiKey", clientId: "user.fixture-client", clientSecret: "fixture-client-secret", password: "fixture-bw-master" })
  stopA()
  assert.equal((await accounts().find((a) => a.id === "work")!.status()).state, "unlocked", "the other location still uses it")
  stopB()
  assert.deepEqual(accounts(), [], "nothing registered once every location is gone")
  const again = await setup()
  assert.equal((await accounts().find((a) => a.id === "work")!.status()).state === "unlocked", false, "the last release locked it")
  again()
})

test("a changed account configuration starts locked", async () => {
  const stop = await setup()
  await accounts().find((a) => a.id === "work")!.unlock({ method: "masterPassword", password: "fixture-bw-master" })
  const changed = { accounts: { ...options.accounts, work: { ...options.accounts.work, autoLockMinutes: 6 } } }
  const next = await setup(changed)
  assert.notEqual((await accounts().find((a) => a.id === "work")!.status()).state, "unlocked")
  next()
  stop()
  rmSync(state, { recursive: true, force: true })
})
