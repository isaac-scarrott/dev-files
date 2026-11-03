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
