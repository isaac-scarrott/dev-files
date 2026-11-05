import assert from "node:assert/strict"
import { test } from "node:test"
import {
  answerTextOf,
  appendBlockingNote,
  createAsyncExecute,
  hasBlocking,
  isJsonObjectSchema,
  questionSummary,
  withBlocking,
} from "../src/override.js"

test("isJsonObjectSchema accepts a plain object schema and rejects anything else", () => {
  assert.ok(isJsonObjectSchema({ type: "object", properties: {} }))
  assert.ok(!isJsonObjectSchema({ type: "object" })) // no properties
  assert.ok(!isJsonObjectSchema({ type: "string" }))
  assert.ok(!isJsonObjectSchema(undefined))
  assert.ok(!isJsonObjectSchema(null))
  assert.ok(!isJsonObjectSchema("schema"))
  // A Zod-like object (has `.extend`, no `.type`/`.properties`) is not mistaken for JSON Schema.
  assert.ok(!isJsonObjectSchema({ extend: () => undefined, _def: {} }))
})

test("withBlocking adds the property without mutating the original", () => {
  const original = { type: "object" as const, properties: { questions: { type: "array" } } }
  const extended = withBlocking(original)
  assert.deepEqual(original.properties, { questions: { type: "array" } }, "original untouched")
  assert.ok(hasBlocking(extended))
  assert.equal(extended.properties.questions, original.properties.questions, "existing properties kept")
})

test("hasBlocking is false for schemas withBlocking never touched", () => {
  assert.ok(!hasBlocking({ type: "object", properties: {} }))
  assert.ok(!hasBlocking(undefined))
})

test("appendBlockingNote keeps the original text and adds a note mentioning blocking:false", () => {
  const note = appendBlockingNote("Asks the user questions")
  assert.ok(note.startsWith("Asks the user questions"))
  assert.match(note, /blocking: false/)
})

test("answerTextOf reads output, then content, then falls back to JSON", () => {
  assert.equal(answerTextOf("plain"), "plain")
  assert.equal(answerTextOf({ output: "from output" }), "from output")
  assert.equal(answerTextOf({ content: "from content" }), "from content")
  assert.equal(answerTextOf({ output: { a: 1 } }), JSON.stringify({ a: 1 }))
  assert.equal(answerTextOf(42), "42")
})

test("questionSummary joins question texts, falling back when the shape is unexpected", () => {
  assert.equal(questionSummary({ questions: [{ question: "A?" }, { question: "B?" }] }), "A?; B?")
  assert.equal(questionSummary({ questions: [] }), "your question")
  assert.equal(questionSummary({}), "your question")
  assert.equal(questionSummary({ questions: "not an array" }), "your question")
})

test("createAsyncExecute: blocking (default) calls the original unchanged and strips nothing else", async () => {
  const calls: unknown[] = []
  const execute = createAsyncExecute({
    original: async (input) => {
      calls.push(input)
      return { output: "answered" }
    },
    sessionIDOf: () => "ses_1",
    synthetic: async () => undefined,
    log: () => undefined,
  })
  const result = await execute({ questions: [{ question: "Q?" }] }, {})
  assert.deepEqual(calls, [{ questions: [{ question: "Q?" }] }])
  assert.deepEqual(result, { output: "answered" })
})

test("createAsyncExecute: blocking:false returns at once and delivers the answer as a synthetic message later", async () => {
  let resolveOriginal!: (value: { output: string }) => void
  const original = new Promise<{ output: string }>((resolve) => (resolveOriginal = resolve))
  const synthetics: unknown[] = []
  const execute = createAsyncExecute({
    original: async () => original,
    sessionIDOf: (ctx: { sessionID: string }) => ctx.sessionID,
    synthetic: async (input) => void synthetics.push(input),
    log: () => undefined,
  })

  const result = await execute({ questions: [{ question: "Q?" }], blocking: false }, { sessionID: "ses_2" })
  assert.match((result as { output: string }).output, /continue with other work/i)
  assert.equal(synthetics.length, 0, "nothing delivered yet")

  resolveOriginal({ output: "the answer" })
  await new Promise((r) => setImmediate(r))
  assert.equal(synthetics.length, 1)
  assert.deepEqual(synthetics[0], {
    sessionID: "ses_2",
    text: "The user answered your non-blocking question: the answer",
    description: "Non-blocking question answered",
  })
})

test("createAsyncExecute: blocking:false delivers a dismissal message if the native ask rejects", async () => {
  const synthetics: unknown[] = []
  const logs: string[] = []
  const execute = createAsyncExecute({
    original: async () => {
      throw new Error("dismissed")
    },
    sessionIDOf: (ctx: { sessionID: string }) => ctx.sessionID,
    synthetic: async (input) => void synthetics.push(input),
    log: (message) => void logs.push(message),
  })

  await execute({ questions: [{ question: "Will this work?" }], blocking: false }, { sessionID: "ses_3" })
  await new Promise((r) => setImmediate(r))
  assert.equal(synthetics.length, 1)
  assert.deepEqual(synthetics[0], {
    sessionID: "ses_3",
    text: 'Your non-blocking question ("Will this work?") was dismissed without an answer.',
    description: "Non-blocking question dismissed",
  })
  assert.ok(logs.some((line) => line.includes("dismissed")))
})

test("createAsyncExecute strips `blocking` before calling the original, so it never sees that key", async () => {
  let seen: unknown
  const execute = createAsyncExecute({
    original: async (input) => {
      seen = input
      return { output: "ok" }
    },
    sessionIDOf: () => "ses_4",
    synthetic: async () => undefined,
    log: () => undefined,
  })
  await execute({ questions: [], blocking: true }, {})
  assert.deepEqual(seen, { questions: [] })
})
