import assert from "node:assert/strict"
import { test } from "node:test"
import { Redactor } from "../plugin/src/redact"
import { covering, nameRule, parseRules, permitted, savedRules, type SavedRule } from "../plugin/src/rules"
import { defaultKind, resolveField } from "../plugin/src/fields"
import { itemFieldOf } from "../plugin/src/broker"
import type { AccountInfo } from "../plugin/src/providers-contract"

const info = (id: string, allowedOrigins?: string[]): AccountInfo => ({ id, label: id, kind: "x", capabilities: { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: [] }, allowedOrigins })

test("rules option: strict shape, helpful errors, no tag rules", () => {
  assert.deepEqual(parseRules(undefined), [])
  assert.deepEqual(parseRules([{ origin: "*.holibob.tech", account: "work" }, { name: "GH", account: ["a", "b"], ref: "op://V/I/f" }]), [
    { name: undefined, origin: "*.holibob.tech", account: ["work"], ref: undefined },
    { name: "GH", origin: undefined, account: ["a", "b"], ref: "op://V/I/f" },
  ])
  assert.throws(() => parseRules({}), /must be a list/)
  assert.throws(() => parseRules([{ tag: "agent", account: "x" }]), /tag rules are not supported/)
  assert.throws(() => parseRules([{ account: "x" }]), /exactly one of name or origin/)
  assert.throws(() => parseRules([{ name: "A", origin: "b", account: "x" }]), /exactly one/)
  assert.throws(() => parseRules([{ name: "a b", account: "x" }]), /name must match/)
  assert.throws(() => parseRules([{ origin: "b" }]), /account must be/)
  assert.throws(() => parseRules([{ origin: "b", account: "x", ref: "r" }]), /ref only applies/)
})

test("permitted: a fenced account serves only its origins; a rule narrows to the accounts it names", () => {
  const all = [info("personal"), info("work", ["*.holibob.tech"])]
  const ids = (origin: string, rules = parseRules(undefined)) => permitted(origin, all, rules).map((account) => account.id)
  assert.deepEqual(ids("https://accounts.google.com"), ["personal"])
  assert.deepEqual(ids("https://admin.holibob.tech"), ["personal", "work"])
  const rules = parseRules([{ origin: "*.holibob.tech", account: "work" }])
  assert.deepEqual(ids("https://admin.holibob.tech", rules), ["work"], "the rule keeps personal out of work sites")
  assert.deepEqual(ids("https://accounts.google.com", rules), ["personal"])
  assert.deepEqual(ids("https://evil-holibob.tech"), ["personal"])
  assert.deepEqual(permitted("https://accounts.google.com", all, parseRules([{ origin: "accounts.google.com", account: "work" }])).map((account) => account.id), [], "a rule naming a fenced-out account serves nobody")
})

test("a saved rule covers the same origin, account, field and item, and nothing else", () => {
  const rule: SavedRule = { id: "r1", origin: "https://accounts.google.com", account: "work", item: "bw2", field: "password", created: 1 }
  const use = { account: "work", field: "password", item: "bw2", origin: "https://accounts.google.com" }
  assert.ok(covering([rule], use))
  for (const other of [{ account: "personal" }, { field: "username" }, { item: "bw9" }, { origin: "https://mail.google.com" }, { origin: "http://accounts.google.com" }]) assert.equal(covering([rule], { ...use, ...other }), undefined)
  const named: SavedRule = { id: "r2", name: "GH", account: "a", field: "password", created: 1 }
  assert.ok(covering([named], { account: "a", field: "password", name: "GH" }))
  assert.equal(covering([named], { account: "a", field: "password", name: "OTHER" }), undefined)
  assert.equal(nameRule("GH", parseRules([{ name: "GH", account: "a" }]))?.account[0], "a")
})

test("a fill rule covers fills only; a get rule covers both", () => {
  const base = { id: "r", origin: "https://x.test", account: "a", field: "password", created: 1 }
  const use = { account: "a", field: "password", origin: "https://x.test" }
  assert.ok(covering([{ ...base, via: "fill" }], { ...use, via: "fill" }))
  assert.equal(covering([{ ...base, via: "fill" }], { ...use, via: "get" }), undefined, "a fill approval is not an approval to hand the value to the agent's code")
  assert.equal(covering([{ ...base, via: "fill" }], use), undefined)
  assert.ok(covering([{ ...base, via: "get" }], { ...use, via: "fill" }))
  assert.ok(covering([base], { ...use, via: "fill" }) && covering([base], { ...use, via: "get" }), "a rule without via is a get rule")
})

test("saved rules add once, list and revoke through a store", async () => {
  const memory = new Map<string, unknown>()
  let n = 0
  const rules = savedRules({ get: async (key) => memory.get(key), set: async (key, value) => void memory.set(key, value) }, () => `id${++n}`, () => 5)
  const use = { account: "work", field: "password", item: "bw2", itemTitle: "Google (work)", origin: "https://accounts.google.com" }
  const first = await rules.add(use)
  assert.deepEqual(first, { id: "id1", origin: "https://accounts.google.com", name: undefined, account: "work", item: "bw2", itemTitle: "Google (work)", field: "password", via: undefined, kind: "field", created: 5 })
  assert.equal((await rules.add(use)).id, "id1", "an equal rule is not saved twice")
  await rules.add({ ...use, field: "username" })
  assert.equal((await rules.list()).length, 2)
  assert.equal(await rules.revoke("id1"), true)
  assert.equal(await rules.revoke("id1"), false)
  assert.deepEqual((await rules.list()).map((rule) => rule.field), ["username"])
})

test("form-urlencoded bodies are redacted: spaces as +, and the !'()~ encodings", () => {
  const redactor = new Redactor()
  const password = "My p@ss word!(1)~'x"
  redactor.set("PASSWORD", password)
  const form = new URLSearchParams({ email: "a@b.test", password }).toString()
  assert.ok(form.includes("My+p%40ss+word%21%281%29%7E%27x") || form.includes("My+p%40ss+word"), form)
  assert.equal(redactor.text(`user=a%40b.test&password=${new URLSearchParams({ p: password }).toString().slice(2)}&x=1`), "user=a%40b.test&password=[REDACTED:PASSWORD]&x=1")
  assert.equal(redactor.text(`p=${encodeURIComponent(password)}`), "p=[REDACTED:PASSWORD]", "the percent form still works")
  assert.equal(redactor.text(`p=${encodeURIComponent(password).replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase())}`), "p=[REDACTED:PASSWORD]", "lower-case hex")
  assert.equal(redactor.text("p=My+p%40ss+word%21%281%29%7E%27x&q=1"), "p=[REDACTED:PASSWORD]&q=1")
})

test("tracked values are redacted but are not secrets by name", () => {
  const redactor = new Redactor()
  redactor.track("PASSWORD", "from-the-vault-123")
  assert.equal(redactor.size, 1)
  assert.deepEqual(redactor.names(), [])
  assert.equal(redactor.get("PASSWORD"), undefined)
  assert.equal(redactor.text("x from-the-vault-123 y"), "x [REDACTED:PASSWORD] y")
  assert.equal(redactor.text(`x ${encodeURIComponent("from-the-vault-123")}`), "x [REDACTED:PASSWORD]")
  for (let i = 0; i < 300; i++) redactor.track("T", `value-number-${i}-padding`)
  assert.equal(redactor.text("value-number-0-padding"), "value-number-0-padding", "the oldest are dropped past the cap")
  assert.equal(redactor.text("value-number-299-padding"), "[REDACTED:T]")
})

test("one-time codes: their own kind, and the item part a name means", () => {
  assert.equal(defaultKind("OTP"), "otp")
  assert.equal(defaultKind("TOTP_CODE"), "otp")
  assert.equal(resolveField({ name: "OTP" }).label, "One-time code")
  assert.equal(resolveField({ name: "OTP" }).masked, true)
  const of = (name: string, extra: { item?: string; kind?: "otp" } = {}) => itemFieldOf({ name, item: extra.item, field: resolveField({ name, kind: extra.kind }) })
  assert.deepEqual([of("PASSWORD"), of("GOOGLE_PASSWORD"), of("EMAIL"), of("USERNAME"), of("OTP"), of("CODE", { kind: "otp" }), of("PIN", { item: "pin" }), of("PIN")], ["password", "password", "username", "username", "otp", "otp", "pin", "PIN"])
})
