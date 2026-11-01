import assert from "node:assert/strict"
import test from "node:test"
import { forecast, humanize, millis, touched, type Config, type Msg } from "./predict"

const MIN = 60_000
const config: Config = { ttlMs: 5 * MIN, minTokens: 20_000 }
const sonnet = { id: "sonnet", providerID: "anthropic" }

/** A finished assistant step whose request started at `created`. */
const step = (created: number, over: Partial<Msg> = {}): Msg => ({
  type: "assistant",
  model: sonnet,
  tokens: { input: 200, output: 800, reasoning: 0, cache: { read: 150_000, write: 29_000 } },
  time: { created, streamed: created + 19_000, completed: created + 20_000 },
  ...over,
})
const user: Msg = { type: "user" }
const compacted: Msg = { type: "compaction", status: "completed" }

const t0 = 1_000_000_000_000

test("warm cache shows nothing and reports when it runs out", () => {
  const result = forecast({ messages: [user, step(t0)], now: t0 + 2 * MIN, config })
  assert.deepEqual(result, { expiresAt: t0 + 5 * MIN })
})

test("expired cache names the last measured size", () => {
  const result = forecast({ messages: [user, step(t0)], now: t0 + 5 * MIN, config })
  assert.deepEqual(result, { notice: { kind: "expired", tokens: 180_000 } })
})

test("expiry counts from the start of the step's request, falling back to streamed then completed", () => {
  assert.equal(touched(step(t0)), t0)
  assert.equal(touched(step(t0, { time: { streamed: 2, completed: 3 } })), 2)
  assert.equal(touched(step(t0, { time: { completed: 3 } })), 3)
  assert.equal(touched(step(t0, { time: {} })), undefined)
  assert.deepEqual(forecast({ messages: [step(t0, { time: {} })], now: t0 + 99 * MIN, config }), {})
})

test("a sent prompt or a running reply silences the warning", () => {
  const late = t0 + 30 * MIN
  assert.deepEqual(forecast({ messages: [step(t0), user], now: late, config }), {})
  assert.deepEqual(forecast({ messages: [step(t0), user, { type: "assistant" }], now: late, config }), {})
})

test("a reply that runs long does not push the expiry later: the request, not the reply's end, touched the cache", () => {
  const long = step(t0, { time: { created: t0, streamed: t0 + 6 * MIN, completed: t0 + 7 * MIN } })
  assert.deepEqual(forecast({ messages: [user, long], now: t0 + 5 * MIN + 1, config }).notice?.kind, "expired")
  assert.deepEqual(forecast({ messages: [user, long], now: t0 + MIN, config }), { expiresAt: t0 + 5 * MIN })
})

test("a failed step without usage is passed over: the last step with usage sets size and anchor", () => {
  const failed: Msg = { type: "assistant", model: sonnet, time: { created: t0 + 70 * MIN, completed: t0 + 70 * MIN + 500 } }
  const result = forecast({ messages: [user, step(t0), user, failed], now: t0 + 80 * MIN, config })
  assert.deepEqual(result, {})
  assert.deepEqual(forecast({ messages: [user, step(t0), failed], now: t0 + 80 * MIN, config }), {
    notice: { kind: "expired", tokens: 180_000 },
  })
})

test("a step still running without usage silences the warning", () => {
  const running: Msg = { type: "assistant", model: sonnet, time: { created: t0 + 10 * MIN } }
  assert.deepEqual(forecast({ messages: [user, step(t0), running], now: t0 + 20 * MIN, config }), {})
})

test("a small context never warns", () => {
  const small = step(t0, { tokens: { input: 10, output: 90, reasoning: 0, cache: { read: 4_000, write: 900 } } })
  assert.deepEqual(forecast({ messages: [small], now: t0 + 30 * MIN, config }), {})
})

test("minTokens is the option's, inclusive", () => {
  const exact = step(t0, { tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 20_000, write: 0 } } })
  const result = forecast({ messages: [exact], now: t0 + 30 * MIN, config })
  assert.equal(result.notice?.kind, "expired")
  assert.deepEqual(forecast({ messages: [exact], now: t0 + 30 * MIN, config: { ...config, minTokens: 20_001 } }), {})
})

test("a provider that reports no cache use gives no claim", () => {
  const plain = step(t0, { tokens: { input: 90_000, output: 800, reasoning: 0, cache: { read: 0, write: 0 } } })
  assert.deepEqual(forecast({ messages: [plain], now: t0 + 30 * MIN, config }), {})
})

test("a different model or variant resets a warm cache", () => {
  const messages = [user, step(t0)]
  const now = t0 + MIN
  const same = { providerID: "anthropic", modelID: "sonnet" }
  assert.deepEqual(forecast({ messages, now, config, selection: same }), { expiresAt: t0 + 5 * MIN })
  assert.equal(forecast({ messages, now, config, selection: { ...same, modelID: "opus" } }).notice?.kind, "model")
  assert.equal(forecast({ messages, now, config, selection: { ...same, providerID: "openai" } }).notice?.kind, "model")
  assert.equal(forecast({ messages, now, config, selection: { ...same, variant: "high" } }).notice?.kind, "model")
})

test("an absent variant equals the empty one", () => {
  const messages = [step(t0, { model: { ...sonnet, variant: "" } })]
  const result = forecast({ messages, now: t0, config, selection: { providerID: "anthropic", modelID: "sonnet" } })
  assert.equal(result.notice, undefined)
})

test("the host's default variant is one choice however it is written", () => {
  const real = { id: "sonnet", providerID: "claude-agent" }
  const messages = [step(t0, { model: { ...real, variant: "default" } })]
  const same = { providerID: "claude-agent", modelID: "sonnet" }
  const warm = { expiresAt: t0 + 5 * MIN }
  assert.deepEqual(forecast({ messages, now: t0 + MIN, config, selection: same }), warm)
  assert.deepEqual(forecast({ messages, now: t0 + MIN, config, selection: { ...same, variant: "" } }), warm)
  assert.deepEqual(forecast({ messages, now: t0 + MIN, config, selection: { ...same, variant: "default" } }), warm)
  assert.equal(forecast({ messages, now: t0 + MIN, config, selection: { ...same, variant: "high" } }).notice?.kind, "model")
  const high = [step(t0, { model: { ...real, variant: "high" } })]
  assert.equal(forecast({ messages: high, now: t0 + MIN, config, selection: same }).notice?.kind, "model")
})

test("a model id written with its provider prefix is the same model", () => {
  const messages = [step(t0, { model: { id: "claude-agent/sonnet", providerID: "claude-agent" } })]
  const selection = { providerID: "claude-agent", modelID: "sonnet" }
  assert.equal(forecast({ messages, now: t0 + MIN, config, selection }).notice, undefined)
  assert.equal(forecast({ messages, now: t0 + MIN, config, selection: { ...selection, modelID: "opus" } }).notice?.kind, "model")
})

test("expiry outranks a model change: switching back would not help", () => {
  const selection = { providerID: "anthropic", modelID: "opus" }
  assert.equal(forecast({ messages: [step(t0)], now: t0 + 9 * MIN, config, selection }).notice?.kind, "expired")
})

test("a completed compaction after the last step says the cache was reset", () => {
  assert.deepEqual(forecast({ messages: [step(t0), compacted], now: t0 + MIN, config }), { notice: { kind: "compacted" } })
})

test("a running or failed compaction changes nothing", () => {
  const running: Msg = { type: "compaction", status: "running" }
  const failed: Msg = { type: "compaction", status: "failed" }
  assert.deepEqual(forecast({ messages: [step(t0), running], now: t0 + MIN, config }), { expiresAt: t0 + 5 * MIN })
  assert.deepEqual(forecast({ messages: [step(t0), failed], now: t0 + MIN, config }), { expiresAt: t0 + 5 * MIN })
})

test("the compaction notice ends with the next prompt, and a compaction before the last step is history", () => {
  assert.deepEqual(forecast({ messages: [step(t0), compacted, user], now: t0, config }), {})
  const small = step(t0 + 10 * MIN, { tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 100, write: 0 } } })
  assert.deepEqual(forecast({ messages: [step(t0), compacted, small], now: t0 + 20 * MIN, config }), {})
})

test("a compaction of a small conversation stays quiet", () => {
  const small = step(t0, { tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 100, write: 0 } } })
  assert.deepEqual(forecast({ messages: [small, compacted], now: t0, config }), {})
})

test("no assistant step, no forecast", () => {
  assert.deepEqual(forecast({ messages: [], now: t0, config }), {})
  assert.deepEqual(forecast({ messages: [user], now: t0, config }), {})
})

test("timestamps arrive as numbers, dates or strings", () => {
  assert.equal(millis(5), 5)
  assert.equal(millis(new Date(7)), 7)
  assert.equal(millis("1970-01-01T00:00:00.009Z"), 9)
  assert.equal(millis({ epochMillis: 11 }), 11)
  assert.equal(millis("soon"), undefined)
  assert.equal(millis(Number.NaN), undefined)
})

test("token counts read like the context ring", () => {
  assert.equal(humanize(180_000, "en"), "180k")
  assert.equal(humanize(1_200_000, "en"), "1m")
  assert.equal(humanize(21_400, "en"), "21k")
})
