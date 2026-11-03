import assert from "node:assert/strict"
import test from "node:test"
import { BACKOFF_MAX_MS, BACKOFF_START_MS, readRpcEvents } from "./events"

const never = (signal: AbortSignal) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))

test("only rpc.<id>.notify events are delivered, with their source", async () => {
  const abort = new AbortController()
  const got: unknown[] = []
  await readRpcEvents({
    signal: abort.signal,
    subscribe: async function* () {
      yield { type: "session.idle", data: 1 }
      yield { type: "rpc.scheduler.changed", data: 2 }
      yield { type: "rpc.scheduler.notify", data: { kind: "error" } }
      yield { type: "rpc.my.plugin.notify", data: 4 }
      abort.abort()
    },
    onEvent: (event) => void got.push(event),
    wait: async () => undefined,
  })
  assert.deepEqual(got, [{ source: "scheduler", data: { kind: "error" } }, { source: "my.plugin", data: 4 }])
})

test("a dropped stream restarts with a doubling backoff that an event resets", async () => {
  const abort = new AbortController()
  const waits: number[] = []
  let runs = 0
  await readRpcEvents({
    signal: abort.signal,
    subscribe: async function* () {
      runs++
      if (runs === 4) yield { type: "rpc.monitor.notify", data: 1 }
      if (runs === 5) abort.abort()
      throw new Error("dropped")
    },
    onEvent: () => undefined,
    wait: async (ms) => void waits.push(ms),
  })
  assert.deepEqual(waits, [BACKOFF_START_MS, 2_000, 4_000, BACKOFF_START_MS])
  assert.ok(BACKOFF_MAX_MS >= 8_000)
})

test("aborting while waiting ends the loop", async () => {
  const abort = new AbortController()
  const done = readRpcEvents({
    signal: abort.signal,
    subscribe: async function* () {
      yield* []
    },
    onEvent: () => undefined,
    wait: (_ms, signal) => never(signal),
  })
  abort.abort()
  await done
})
