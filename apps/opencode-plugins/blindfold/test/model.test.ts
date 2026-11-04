import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { resolveField } from "../plugin/src/fields"
import { createModel, type Io } from "../plugin/src/model"

const fields = [resolveField({ name: "EMAIL" }), resolveField({ name: "PASSWORD" })]

function mount(io: Partial<Io> = {}) {
  const sent: Record<string, string>[] = []
  const calls = { cancel: 0, failed: 0 }
  const model = createRoot(() =>
    createModel(fields, {
      submit: async (values) => (sent.push(values), true),
      cancel: async () => (calls.cancel++, true),
      failed: () => void calls.failed++,
      ...io,
    }),
  )
  return { model, sent, calls }
}

test("ready needs every field, and rejects an email that cannot be one", () => {
  const { model } = mount()
  assert.equal(model.ready(), false)
  model.set("EMAIL", "nope")
  model.set("PASSWORD", "p")
  assert.equal(model.ready(), false)
  model.set("EMAIL", "ada@example.com")
  assert.equal(model.ready(), true)
})

test("next points at the first empty or invalid field, wrapping after the given one", () => {
  const { model } = mount()
  assert.equal(model.next(), "EMAIL")
  model.set("EMAIL", "ada@example.com")
  assert.equal(model.next(), "PASSWORD")
  assert.equal(model.next("EMAIL"), "PASSWORD")
  model.set("PASSWORD", "x")
  assert.equal(model.next(), undefined)
})

test("submit sends trimmed plain fields and the secret as typed, then empties every value", async () => {
  const { model, sent } = mount()
  model.set("EMAIL", "  ada@example.com ")
  model.set("PASSWORD", " pa ss ")
  model.toggle("PASSWORD")
  await model.submit()
  assert.deepEqual(sent, [{ EMAIL: "ada@example.com", PASSWORD: " pa ss " }])
  assert.equal(model.phase(), "provided")
  assert.equal(model.value("EMAIL"), "")
  assert.equal(model.value("PASSWORD"), "")
  assert.equal(model.revealed("PASSWORD"), false)
})

test("an incomplete submit sends nothing and marks every field touched", async () => {
  const { model, sent } = mount()
  model.set("EMAIL", "ada@example.com")
  await model.submit()
  assert.deepEqual(sent, [])
  assert.equal(model.touched("PASSWORD"), true)
  assert.equal(model.phase(), "open")
})

test("a failed send reopens the card with what was typed", async () => {
  const { model, calls } = mount({ submit: async () => Promise.reject(new Error("offline")) })
  model.set("EMAIL", "ada@example.com")
  model.set("PASSWORD", "pw")
  await model.submit()
  assert.equal(model.phase(), "open")
  assert.equal(model.value("PASSWORD"), "pw")
  assert.equal(calls.failed, 1)
})

test("a send the server no longer wants is expired, and values are gone either way", async () => {
  const { model } = mount({ submit: async () => false })
  model.set("EMAIL", "ada@example.com")
  model.set("PASSWORD", "pw")
  await model.submit()
  assert.equal(model.phase(), "expired")
  assert.equal(model.value("PASSWORD"), "")
})

test("cancel declines and empties the values", async () => {
  const { model, calls } = mount()
  model.set("EMAIL", "ada@example.com")
  await model.cancel()
  assert.equal(model.phase(), "declined")
  assert.equal(calls.cancel, 1)
  assert.equal(model.value("EMAIL"), "")
})

test("settle follows the server's outcome once, and never undoes a final phase", async () => {
  const a = mount()
  a.model.set("EMAIL", "ada@example.com")
  a.model.settle("submitted")
  assert.equal(a.model.phase(), "provided")
  assert.equal(a.model.value("EMAIL"), "")
  a.model.settle("timeout")
  assert.equal(a.model.phase(), "provided")
  const b = mount()
  b.model.settle("cancelled")
  assert.equal(b.model.phase(), "declined")
  const c = mount()
  c.model.settle("unavailable")
  assert.equal(c.model.phase(), "expired")
})

test("an answer elsewhere while sending wins over the late reply", async () => {
  let release!: (accepted: boolean) => void
  const { model } = mount({ submit: () => new Promise<boolean>((resolve) => (release = resolve)) })
  model.set("EMAIL", "ada@example.com")
  model.set("PASSWORD", "pw")
  const sending = model.submit()
  model.settle("cancelled")
  release(true)
  await sending
  assert.equal(model.phase(), "declined")
})

// ---- Provider rows ----

import type { RequestedField } from "../plugin/src/rpc"

const candidate = (account: string, state: "ready" | "locked", extra = {}) => ({ key: state === "ready" ? `${account}:i1` : account, account, label: `${account} label`, state, methods: state === "locked" ? ["masterPassword" as const] : [], covered: false, ...(state === "ready" ? { item: { id: "i1", title: "Google" } } : {}), ...extra })
const row = (name: string, candidates: ReturnType<typeof candidate>[], selected?: string): RequestedField => ({ ...resolveField({ name }), source: { state: "choose", candidates, ...(selected ? { selected } : {}) } })

function mountProvider(rows: RequestedField[], io: Partial<Io> = {}) {
  const sent: { values: Record<string, string>; extra?: { picks: Record<string, string>; remember: boolean; flow: boolean } }[] = []
  const unlocks: { account: string; input: unknown }[] = []
  const model = createRoot(() =>
    createModel(rows, {
      submit: async (values, extra) => (sent.push({ values, extra }), true),
      cancel: async () => true,
      unlock: async (account, _method, input) => (unlocks.push({ account, input }), { accepted: true }),
      failed: () => undefined,
      ...io,
    }),
  )
  return { model, sent, unlocks }
}

test("a provider row with one ready candidate is ready without typing; Allow sends its pick and Always allow remembers", async () => {
  const { model, sent } = mountProvider([row("PASSWORD", [candidate("personal", "ready")], "personal:i1")])
  assert.equal(model.ready(), true)
  assert.equal(model.next(), undefined, "nothing to type")
  await model.submit(true)
  assert.deepEqual(sent, [{ values: {}, extra: { picks: { PASSWORD: "personal:i1" }, remember: true, flow: false } }])
  assert.equal(model.phase(), "provided")
  assert.equal(model.summary(), "PASSWORD (personal label)")
})

test("two candidates need a choice before Allow; the choice is what is sent", async () => {
  const { model, sent } = mountProvider([row("PASSWORD", [candidate("personal", "ready"), candidate("work", "ready", { key: "work:i2" })])])
  assert.equal(model.ready(), false)
  model.choose("PASSWORD", "work:i2")
  assert.equal(model.ready(), true)
  await model.submit()
  assert.deepEqual(sent[0]!.extra, { picks: { PASSWORD: "work:i2" }, remember: false, flow: false })
})

test("a locked pick blocks Allow; unlock sends the typed credential once and empties it, and the update unblocks", async () => {
  const { model, unlocks } = mountProvider([row("PASSWORD", [candidate("work", "locked")], "work")])
  assert.equal(model.ready(), false)
  assert.equal(model.unlockable("work", "masterPassword"), false)
  model.setSecret("work", "password", "fake-master-pw")
  assert.equal(model.unlockable("work", "masterPassword"), true)
  const pending = model.unlock("work", "masterPassword")
  assert.equal(model.secret("work", "password"), "", "emptied before the answer arrives")
  await pending
  assert.deepEqual(unlocks, [{ account: "work", input: { password: "fake-master-pw" } }])
  model.update([row("PASSWORD", [candidate("work", "ready", { key: "work:i2" })], "work:i2")])
  assert.equal(model.ready(), true)
})

test("a failed unlock shows the vendor's line and keeps the card open", async () => {
  const { model } = mountProvider([row("PASSWORD", [candidate("work", "locked")], "work")], { unlock: async () => ({ accepted: true, error: "Invalid master password." }) })
  model.setSecret("work", "password", "fake-wrong-pw")
  await model.unlock("work", "masterPassword")
  assert.equal(model.unlockError("work"), "Invalid master password.")
  assert.equal(model.phase(), "open")
  assert.equal(model.secret("work", "password"), "")
})

test("an update keeps typed text and a choice whose account is still offered", () => {
  const { model } = mountProvider([row("PASSWORD", [candidate("personal", "ready"), candidate("work", "locked")]), { ...resolveField({ name: "RECOVERY" }) }])
  model.set("RECOVERY", "typed answer")
  model.choose("PASSWORD", "work")
  model.update([row("PASSWORD", [candidate("personal", "ready"), candidate("work", "ready", { key: "work:i2" })]), { ...resolveField({ name: "RECOVERY" }) }])
  assert.equal(model.selectedKey(model.fields[0]!), "work:i2", "the work choice moved to its new key")
  assert.equal(model.value("RECOVERY"), "typed answer")
})

test("a typed field and a provider field together: both are needed", async () => {
  const { model, sent } = mountProvider([row("PASSWORD", [candidate("personal", "ready")], "personal:i1"), { ...resolveField({ name: "RECOVERY" }), source: { state: "unavailable", candidates: [], hint: "no such field" } }])
  assert.equal(model.ready(), false)
  model.set("RECOVERY", "abc")
  assert.equal(model.ready(), true)
  await model.submit()
  assert.deepEqual(sent[0], { values: { RECOVERY: "abc" }, extra: { picks: { PASSWORD: "personal:i1" }, remember: false, flow: false } })
})

test("Deny declines; the server settling a request (an unlock completed it) shows the answered row", async () => {
  const denied = mountProvider([row("PASSWORD", [candidate("personal", "ready")], "personal:i1")])
  await denied.model.cancel()
  assert.equal(denied.model.phase(), "declined")
  const auto = mountProvider([row("PASSWORD", [candidate("work", "locked")], "work")])
  auto.model.settle("submitted")
  assert.equal(auto.model.phase(), "provided")
  assert.equal(auto.model.summary(), "PASSWORD (work label)")
})

// ---- flow approval ----------------------------------------------------------------------------------------------------

const offer = { parts: ["username", "password", "otp"], always: ["username", "password"], minutes: 3 }
const signIn = (flow: typeof offer | null = offer) =>
  ["EMAIL", "PASSWORD"].map((name) => ({
    ...resolveField({ name }),
    source: { state: "choose" as const, selected: "p:1", candidates: [{ key: "p:1", account: "p", label: "Personal (1Password)", state: "ready" as const, methods: [], item: { id: "1", title: "Google" }, covered: false, ...(flow ? { flow } : {}) }] },
  }))

function mountFlow(rows = signIn(), io: Partial<Io> = {}) {
  const sent: { values: Record<string, string>; extra?: { picks: Record<string, string>; remember: boolean; flow: boolean } }[] = []
  const model = createRoot(() => createModel(rows, { submit: async (values, extra) => (sent.push({ values, extra }), true), cancel: async () => true, failed: () => {}, ...io }))
  return { model, sent }
}

test("a card whose candidate offers a sign-in is in flow mode, and Allow sends flow: true", async () => {
  const { model, sent } = mountFlow()
  assert.equal(model.flowOn(), true)
  assert.equal(model.alwaysOffered(), true)
  await model.submit()
  assert.deepEqual(sent[0]!.extra, { picks: { EMAIL: "p:1", PASSWORD: "p:1" }, remember: false, flow: true })
  assert.deepEqual(model.signIn(), { account: "Personal (1Password)", item: "Google", always: false, count: 2 })
  model.flowed(3)
  assert.equal(model.signIn()!.count, 3)
})

test("'Only this field' turns the sign-in off and back on; the answer then carries flow: false", async () => {
  const { model, sent } = mountFlow()
  model.toggleOnly()
  assert.deepEqual([model.flowOn(), model.offer() !== undefined], [false, true])
  await model.submit(true)
  assert.equal(sent[0]!.extra!.flow, false)
  assert.equal(model.signIn(), undefined)
  const again = mountFlow()
  again.model.toggleOnly()
  again.model.toggleOnly()
  assert.equal(again.model.flowOn(), true)
})

test("Always allow on a sign-in is remembered as such and the row says so; later uses do not change it", async () => {
  const { model } = mountFlow()
  await model.submit(true)
  assert.equal(model.signIn()!.always, true)
  model.flowed(5)
  assert.equal(model.signIn()!.count, 2)
})

test("no sign-in without an offer on every provider field; a code field hides Always allow unless flow mode covers it", () => {
  assert.equal(mountFlow(signIn(null)).model.flowOn(), false)
  const mixed = signIn()
  mixed[1]!.source.candidates[0] = { ...mixed[1]!.source.candidates[0]!, key: "p:2" }
  mixed[1]!.source.selected = "p:2"
  assert.equal(mountFlow(mixed).model.flowOn(), false, "two items are not one sign-in")
  const code = signIn(null).slice(0, 1).map((row) => ({ ...row, source: { ...row.source, candidates: [{ ...row.source.candidates[0]!, once: true }] } }))
  assert.equal(mountFlow(code).model.alwaysOffered(), false)
})
