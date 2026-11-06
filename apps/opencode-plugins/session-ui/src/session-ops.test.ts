import assert from "node:assert/strict"
import { test } from "node:test"
import type { ServerRef } from "@opencode/plugin/gui"
import { fake } from "../../test-utils/fake"
import { setArchived } from "./session-ops"

test("native archive and restore send exact authoritative update and verify get", async () => {
  for (const archived of [true, false]) {
    const calls: unknown[] = []
    const signal = new AbortController().signal
    const server = fake<ServerRef>({ client: { session: {
      update: async (...args: unknown[]) => { calls.push(args) },
      get: async () => ({ time: archived ? { archived: 10 } : {} }),
    } } })
    await setArchived(server, "session", archived, signal)
    assert.deepEqual(calls, [[{ sessionID: "session", archived }, { signal }]])
  }
})
test("archive write errors and unconfirmed server state remain failures", async () => {
  const signal = new AbortController().signal
  const server = fake<ServerRef>({ client: { session: { update: async () => { throw new Error("denied") }, get: async () => ({ time: {} }) } } })
  await assert.rejects(setArchived(server, "s", true, signal), /denied/)
  server.client.session.update = async () => {}
  await assert.rejects(setArchived(server, "s", true, signal), /confirm/)
})

test("a dedicated archive/unarchive call is preferred when the client has one; a failing one falls back to update; 2.2.5 has none", async () => {
  const run = async (dedicated: "none" | "works" | "fails") => {
    const signal = new AbortController().signal
    const calls: unknown[] = []
    let archived = false
    const session: Record<string, unknown> = {
      update: async (input: { archived: boolean }) => { calls.push(["update", input.archived]); archived = input.archived },
      get: async () => ({ time: archived ? { archived: 10 } : {} }),
    }
    if (dedicated !== "none") for (const name of ["archive", "unarchive"]) session[name] = async () => { calls.push([name]); if (dedicated === "fails") throw new Error("bad shape"); archived = name === "archive" }
    const server = fake<Parameters<typeof setArchived>[0]>({ client: { session } })
    await setArchived(server, "s", true, signal); await setArchived(server, "s", false, signal)
    return calls
  }
  assert.deepEqual(await run("none"), [["update", true], ["update", false]])
  assert.deepEqual(await run("works"), [["archive"], ["unarchive"]])
  assert.deepEqual(await run("fails"), [["archive"], ["update", true], ["unarchive"], ["update", false]])
})
