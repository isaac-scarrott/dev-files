import assert from "node:assert/strict"
import { test } from "node:test"
import { askIdentity } from "./merge.js"
import { answerAsk, dismissAsk, emptyFile, mergeAsk, parseFile, pendingAsks, type InboxFile } from "./store.js"

const HOUR = 3_600_000
const rememberMs = 24 * HOUR

const ask = (file: InboxFile, input: Partial<Parameters<typeof mergeAsk>[1]> = {}) =>
  mergeAsk(file, { question: "Should I merge this?", blocking: true, session: "ses_1", root: "ses_1", now: 10_000, rememberMs, ...input })

test("a new ask gets #1, and the same text asked again counts instead of adding a second item", () => {
  const file = emptyFile()
  const first = ask(file)
  assert.equal(first.type, "new")
  assert.equal(first.record.asks, 1)
  assert.equal(first.record.id, 1)
  const second = ask(file, { question: "  should I merge THIS?  ", now: 50_000 })
  assert.equal(second.type, "pending")
  assert.equal(second.record.id, 1)
  assert.equal(second.record.asks, 2)
  assert.equal(second.record.lastAskedAt, 50_000)
  assert.equal(pendingAsks(file).length, 1)
  assert.equal(file.nextID, 2)
})

test("a re-ask in another root family is its own item; a ref is the same item anywhere", () => {
  const file = emptyFile()
  ask(file, { session: "ses_a", root: "ses_a" })
  const other = ask(file, { session: "ses_b", root: "ses_b" })
  assert.equal(other.type, "new")
  assert.equal(pendingAsks(file).length, 2)

  const byRef = ask(file, { question: "Anything to add?", ref: "plan", session: "ses_a", root: "ses_a" })
  assert.equal(byRef.type, "new")
  const again = ask(file, { question: "Anything else?", ref: "plan", session: "ses_b", root: "ses_b" })
  assert.equal(again.type, "pending")
  assert.equal(again.record.id, byRef.record.id)
})

test("once answered, a re-ask within the window counts and hands the same answer back", () => {
  const file = emptyFile()
  const first = ask(file)
  answerAsk(file, first.record.id, "Yes, squash it.", 20_000)
  assert.equal(pendingAsks(file).length, 0)
  const again = ask(file, { now: 30_000 })
  assert.equal(again.type, "answered")
  assert.equal(again.record.answer, "Yes, squash it.")
  assert.equal(again.record.asks, 2)
  assert.equal(pendingAsks(file).length, 0)
})

test("an answer older than the window is forgotten, so the same question can be asked again", () => {
  const file = emptyFile()
  const first = ask(file, { now: 1_000 })
  answerAsk(file, first.record.id, "Yes.", 2_000)
  const later = ask(file, { now: 2_000 + rememberMs + 1 })
  assert.equal(later.type, "new")
  assert.equal(later.record.id, 2)
  assert.equal(later.record.asks, 1)
  assert.equal(file.asks.length, 1, "the settled one is pruned")
})

test("dismissing takes the ask out of the waiting list without answering it", () => {
  const file = emptyFile()
  const first = ask(file)
  assert.equal(dismissAsk(file, first.record.id, 20_000)?.dismissedAt, 20_000)
  assert.equal(pendingAsks(file).length, 0)
  assert.equal(answerAsk(file, first.record.id, "late", 30_000), undefined, "an answered-away ask takes no answer")
})

test("a file read back keeps the records it can and drops what is malformed", () => {
  const file = emptyFile()
  ask(file)
  const raw = JSON.parse(JSON.stringify(file))
  raw.asks.push({ id: "not a number", question: "x" }, { ...raw.asks[0], id: 9, key: "text:ffffffff" })
  const parsed = parseFile(raw)
  assert.deepEqual(parsed.asks.map((record) => record.id), [1, 9])
  assert.equal(parsed.nextID, 10)
  assert.deepEqual(parseFile(undefined), emptyFile())
  assert.deepEqual(parseFile("nonsense"), emptyFile())
})

test("the identity a stored ask carries is the one it was merged by", () => {
  const file = emptyFile()
  const record = ask(file, { ref: "deploy" }).record
  assert.deepEqual({ key: record.key, scope: record.scope, ref: record.ref }, askIdentity({ question: "ignored", ref: "deploy" }))
})
