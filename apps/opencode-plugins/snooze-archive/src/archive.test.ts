import assert from "node:assert/strict"
import { test } from "node:test"
import type { ServerRef } from "@opencode/plugin/gui"
import { appendPage, dropArchived, emptyPage, loadArchivePage, setArchived, upsertArchived, type ArchivedSession, type ArchivePage } from "./archive"

const row = (id: string, updated: number, archived: number | null = 1) => ({ id, time: { created: 1, updated, ...(archived === null ? {} : { archived }) } }) as unknown as ArchivedSession
const page = (rows: ArchivedSession[], next?: string, loaded = true): ArchivePage => ({ ...emptyPage(), rows, next, more: next !== undefined, loaded })
const ids = (state: ArchivePage) => state.rows.map((r) => r.id)

test("loadArchivePage asks for exactly one page and drops rows that are not archived", async () => {
  const calls: unknown[] = []
  const server = { client: { session: { list: async (input: unknown) => {
    calls.push(input)
    return { data: [row("a", 5), row("active", 4, null)], cursor: { next: "p2" } }
  } } } } as unknown as ServerRef
  const result = await loadArchivePage(server, undefined, 10, new AbortController().signal)
  assert.deepEqual(result.rows.map((r) => r.id), ["a"])
  assert.equal(result.next, "p2")
  assert.deepEqual(calls, [{ archived: true, parentID: null, limit: 10, cursor: undefined }])
})
test("a repeated cursor rejects rather than looping", async () => {
  const server = { client: { session: { list: async () => ({ data: [], cursor: { next: "same" } }) } } } as unknown as ServerRef
  await assert.rejects(loadArchivePage(server, "same", 25, new AbortController().signal), /repeated/)
})
test("appendPage joins pages without duplicates; a stale page replaces", () => {
  const first = appendPage(emptyPage(), [row("a", 9), row("b", 8)], "p2")
  assert.equal(first.more, true)
  const second = appendPage(first, [row("b", 8), row("c", 7)], undefined)
  assert.deepEqual(ids(second), ["a", "b", "c"])
  assert.equal(second.more, false)
  assert.deepEqual(ids(appendPage({ ...second, stale: true }, [row("z", 1)], undefined)), ["z"])
})
test("a session archived while pages remain is inserted by order, or left for the page that holds it", () => {
  const state = page([row("a", 9), row("b", 5)], "p2")
  assert.deepEqual(ids(upsertArchived(state, row("n", 10))), ["n", "a", "b"], "newest goes first")
  assert.deepEqual(ids(upsertArchived(state, row("m", 7))), ["a", "m", "b"])
  assert.deepEqual(ids(upsertArchived(state, row("old", 1))), ["a", "b"], "belongs after the loaded tail")
  assert.deepEqual(ids(upsertArchived({ ...state, more: false }, row("old", 1))), ["a", "b", "old"], "last page: tail is the end")
  assert.deepEqual(ids(upsertArchived(state, row("a", 9))), ["a", "b"], "already loaded: once")
})
test("restore, delete and a child session leave the loaded rows without duplicates or losses", () => {
  const state = page([row("a", 9), row("b", 5), row("c", 3)], "p2")
  assert.deepEqual(ids(upsertArchived(state, row("b", 5, null))), ["a", "c"], "restored")
  assert.deepEqual(ids(dropArchived(state, "c")), ["a", "b"])
  assert.equal(dropArchived(state, "gone"), state)
  assert.deepEqual(ids(upsertArchived(state, { ...row("x", 9), parentID: "a" } as ArchivedSession)), ["a", "b", "c"], "subagents are not listed")
  assert.equal(upsertArchived(state, { ...row("b", 5), title: "Renamed" } as ArchivedSession).rows[1].title, "Renamed")
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

test("archivedActivity ignores the archive's own update bump", async () => {
  const { archivedActivity } = await import("./archive")
  assert.equal(archivedActivity({ created: 1, updated: 50, archived: 40 }), 1, "bumped, nothing else known: creation")
  assert.equal(archivedActivity({ created: 1, updated: 50, archived: 40, busy: 10, idle: 30 }), 30, "last idle")
  assert.equal(archivedActivity({ created: 1, updated: 50, archived: 40, busy: 35, idle: 30 }), 35, "ended mid-run")
  assert.equal(archivedActivity({ created: 1, updated: 20, archived: 40 }), 20, "updated before archiving stands")
  assert.equal(archivedActivity({ created: 1, updated: 20 }), 20)
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
    const server = { client: { session } } as unknown as Parameters<typeof setArchived>[0]
    await setArchived(server, "s", true, signal); await setArchived(server, "s", false, signal)
    return calls
  }
  assert.deepEqual(await run("none"), [["update", true], ["update", false]])
  assert.deepEqual(await run("works"), [["archive"], ["unarchive"]])
  assert.deepEqual(await run("fails"), [["archive"], ["update", true], ["unarchive"], ["update", false]])
})
