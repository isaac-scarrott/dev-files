import assert from "node:assert/strict"
import { test } from "node:test"
import type { ServerRef } from "@opencode/plugin/gui"
import { loadArchive, setArchived } from "./archive"

test("archive count loads every page and deduplicates by session id", async () => {
  const calls: unknown[] = []
  const server = { client: { session: { list: async (input: { cursor?: string }) => {
    calls.push(input)
    return input.cursor ? { data: [{ id: "a", time: { archived: 1 } }, { id: "b", time: { archived: 2 } }], cursor: {} }
      : { data: [{ id: "a", time: { archived: 1 } }, { id: "active", time: {} }], cursor: { next: "page2" } }
  } } } } as unknown as ServerRef
  assert.equal((await loadArchive(server, new AbortController().signal)).length, 2)
  assert.deepEqual(calls, [{ archived: true, parentID: null, limit: 100, cursor: undefined }, { archived: true, parentID: null, limit: 100, cursor: "page2" }])
})
test("archive pagination errors reject rather than publishing partial counts", async () => {
  const server = { client: { session: { list: async () => ({ data: [], cursor: { next: "same" } }) } } } as unknown as ServerRef
  await assert.rejects(loadArchive(server, new AbortController().signal), /repeated/)
})
test("native archive and restore send exact authoritative update and verify get", async () => {
  for (const archived of [true, false]) {
    const calls: unknown[] = []
    const signal = new AbortController().signal
    const server = { client: { session: {
      update: async (...args: unknown[]) => { calls.push(args) },
      get: async () => ({ time: archived ? { archived: 10 } : {} }),
    } } } as unknown as ServerRef
    await setArchived(server, "session", archived, signal)
    assert.deepEqual(calls, [[{ sessionID: "session", archived }, { signal }]])
  }
})
test("archive write errors and unconfirmed server state remain failures", async () => {
  const signal = new AbortController().signal
  const server = { client: { session: { update: async () => { throw new Error("denied") }, get: async () => ({ time: {} }) } } } as unknown as ServerRef
  await assert.rejects(setArchived(server, "s", true, signal), /denied/)
  server.client.session.update = async () => {}
  await assert.rejects(setArchived(server, "s", true, signal), /confirm/)
})
