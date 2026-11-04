import { test } from "node:test"
import assert from "node:assert/strict"
import { INSTALL, probeMessage, stepsOf, toolTone } from "../src/checklist.js"
import { classify } from "../src/probe.js"
import type { AccountView, Tool } from "../src/rpc.js"
import { en } from "../src/messages.js"

const tools = (op: boolean, bw: boolean): Record<"1password" | "bitwarden", Tool> => ({ "1password": { bin: "op", installed: op }, bitwarden: { bin: "bw", installed: bw } })
const view = (extra: Partial<AccountView> = {}): AccountView => ({
  id: "a", provider: "1password", label: "A", source: "stored", enabled: true, allowedOrigins: [], autoLockMinutes: 10, vaults: [], confirmEveryUse: false, alwaysAllowOtp: false, credential: false, lock: { state: "locked" }, ...extra,
})
const tones = (account: AccountView, op = true, confirmed = false) => Object.fromEntries(stepsOf(account, { tools: tools(op, true), confirmed: { opAppIntegrationOff: confirmed } }).map((step) => [step.id, step.tone]))

test("1Password checklist: each step has its own state and moves with what happened", () => {
  assert.deepEqual(tones(view(), false), { cli: "bad", appOff: "todo", token: "bad", vault: "idle", login: "idle" })
  assert.deepEqual(tones(view({ credential: true }), true, true), { cli: "ok", appOff: "ok", token: "ok", vault: "idle", login: "idle" })
  const ok = { at: 1, probe: { ok: true, code: "ok" as const, count: 3 } }
  assert.deepEqual(tones(view({ credential: true, test: ok, verified: { ...ok, itemId: "x" } }), true, true), { cli: "ok", appOff: "ok", token: "ok", vault: "ok", login: "ok" })
  assert.equal(tones(view({ credential: true, test: { at: 1, probe: { ok: false, code: "rate_limited" } } })).vault, "bad")
})

test("Bitwarden checklist: key, unlock and collection", () => {
  const bw = (extra: Partial<AccountView> = {}) => view({ provider: "bitwarden", ...extra })
  assert.deepEqual(tones(bw()), { cli: "ok", key: "bad", unlock: "todo", collection: "idle" })
  assert.deepEqual(tones(bw({ credential: true, lock: { state: "unlocked" }, test: { at: 1, probe: { ok: true, code: "ok", count: 2 } } })), { cli: "ok", key: "ok", unlock: "ok", collection: "ok" })
})

test("tools: missing shows the exact install command", () => {
  assert.equal(toolTone({ bin: "bw", installed: false }), "bad")
  assert.equal(INSTALL.bitwarden, "brew install bitwarden-cli")
})

test("every probe code has a message the page can show, and none embeds a value", () => {
  const codes = ["no_token", "token_rejected", "vault_not_found", "rate_limited", "cli_missing", "app_prompt", "timeout", "locked", "not_logged_in", "other"] as const
  for (const code of codes) {
    const message = probeMessage("1password", { ok: false, code, detail: "first line" }, "Agent")
    assert.ok(en[message.key], `${message.key} has text`)
  }
  assert.ok(en[probeMessage("1password", { ok: true, code: "ok", count: 1 }).key])
  assert.ok(en[probeMessage("bitwarden", { ok: true, code: "ok", count: 1 }).key])
})

test("classify maps the vendors' documented messages, and scrubs the secret from the detail", () => {
  const run = (stderr: string, extra = {}) => ({ code: 1, stdout: "", stderr, missing: false, timedOut: false, ...extra })
  assert.equal(classify(run("[ERROR] x invalid service account token"), ["ops_secret"]).code, "token_rejected")
  assert.equal(classify(run("[ERROR] x \"Nope\" isn't a vault in this account"), [], "Nope").code, "vault_not_found")
  assert.equal(classify(run("too many requests (429)")).code, "rate_limited")
  assert.equal(classify(run("", { missing: true })).code, "cli_missing")
  assert.equal(classify(run("", { timedOut: true })).code, "timeout")
  assert.equal(classify(run("the 1Password app integration needs approval")).code, "app_prompt")
  const other = classify(run("[ERROR] x something odd ops_secret"), ["ops_secret"])
  assert.equal(other.code, "other")
  assert.ok(!other.detail!.includes("ops_secret"))
})
