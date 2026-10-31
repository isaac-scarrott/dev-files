import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { ABANDONED_AFTER, ARCHIVED_AFTER, DAY, removeIfUnused, scratchBase, scratchId, sweep, type SessionLister } from "./sweep.js"

const NOW = Date.parse("2026-10-31T12:00:00Z")
const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "np-sweep-"))
  const base = path.join(root, "no-project")
  await mkdir(base)
  return { root, base, done: () => rm(root, { recursive: true, force: true }) }
}

async function folder(base: string, id: string, ageMs = 0, files = false) {
  const dir = path.join(base, id)
  await mkdir(path.join(dir, "No project"), { recursive: true })
  await writeFile(path.join(dir, "No project", "README.md"), "x")
  if (files) await writeFile(path.join(dir, "No project", "work.txt"), "y")
  const when = new Date(NOW - ageMs)
  await utimes(dir, when, when)
}

const ls = (base: string) => readdir(base).then((names) => names.sort())

type S = { id: string; id2?: string; directory: string; archived?: number }
/** A fake session API: live and archived lists, paged two at a time, filterable by directory. */
function client(sessions: S[], fail?: (call: number) => boolean): SessionLister & { calls: number } {
  const api = {
    calls: 0,
    session: {
      async list(input: { archived?: boolean; limit?: number; cursor?: string; directory?: string }) {
        api.calls++
        if (fail?.(api.calls)) throw new Error("boom")
        const all = sessions
          .filter((s) => (input.archived ? s.archived !== undefined : s.archived === undefined))
          .filter((s) => !input.directory || s.directory === input.directory)
        const start = input.cursor ? Number(input.cursor) : 0
        const slice = all.slice(start, start + 2)
        return {
          data: slice.map((s) => ({ id: s.id, time: { archived: s.archived }, location: { directory: s.directory } })),
          cursor: { next: start + 2 < all.length ? String(start + 2) : null },
        }
      },
    },
  }
  return api
}
const dirOf = (base: string, id: string) => path.join(base, id, "No project")

test("scratchId accepts only <uuid>/No project under the base", () => {
  const base = "/data/no-project"
  assert.equal(scratchId(base, `${base}/${A}/No project`), A)
  assert.equal(scratchId(base, `${base}/${A}/No project/sub/dir`), A)
  assert.equal(scratchId(base, `${base}/not-a-uuid/No project`), undefined)
  assert.equal(scratchId(base, `${base}/${A}/Other`), undefined)
  assert.equal(scratchId(base, `${base}/${A}`), undefined)
  assert.equal(scratchId(base, `${base}/../${A}/No project`), undefined)
  assert.equal(scratchId(base, `${base}/${A}/../../etc/No project`), undefined)
  assert.equal(scratchId(base, `/elsewhere/${A}/No project`), undefined)
  assert.equal(scratchId(base, `/data/no-project-evil/${A}/No project`), undefined)
})

test("scratchBase: XDG data dir, else home, else none", () => {
  assert.equal(scratchBase({ XDG_DATA_HOME: "/x" }, () => "/h"), "/x/opencode/no-project")
  assert.equal(scratchBase({ XDG_DATA_HOME: "rel" }, () => "/h"), "/h/.local/share/opencode/no-project")
  assert.equal(scratchBase({}, () => "/h"), "/h/.local/share/opencode/no-project")
  assert.equal(scratchBase({}, () => ""), undefined)
  assert.equal(scratchBase({}, () => { throw new Error("no home") }), undefined)
})

test("archived 6d is kept, 8d is deleted; the boundary is kept", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 30 * DAY, true)
    await folder(base, B, 30 * DAY, true)
    const sessions = (days: number) => [
      { id: "ses_a", directory: dirOf(base, A), archived: NOW - days * DAY },
      { id: "ses_b", directory: dirOf(base, B), archived: NOW - ARCHIVED_AFTER },
    ]
    assert.deepEqual(await sweep({ base, client: client(sessions(6)), now: NOW }), [])
    assert.deepEqual(await ls(base), [A, B])
    assert.deepEqual(await sweep({ base, client: client(sessions(8)), now: NOW }), [A])
    assert.deepEqual(await ls(base), [B])
  } finally { await done() }
})

test("a live session, or one live among archived ones, keeps the folder even when it holds files", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 90 * DAY, true)
    await folder(base, B, 90 * DAY, true)
    const sessions = [
      { id: "s1", directory: dirOf(base, A) },
      { id: "s2", directory: dirOf(base, B), archived: NOW - 30 * DAY },
      { id: "s3", directory: dirOf(base, B) },
    ]
    assert.deepEqual(await sweep({ base, client: client(sessions), now: NOW }), [])
    assert.deepEqual(await ls(base), [A, B])
  } finally { await done() }
})

test("a folder with no session: abandoned draft goes after 24h, not at 23h", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, ABANDONED_AFTER - 3600_000)
    await folder(base, B, ABANDONED_AFTER + 3600_000)
    assert.deepEqual(await sweep({ base, client: client([]), now: NOW }), [B])
    assert.deepEqual(await ls(base), [A])
  } finally { await done() }
})

test("a deleted session's folder (no session left) goes once old; the event path removes it at once", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 10 * 60_000, true)
    assert.deepEqual(await sweep({ base, client: client([]), now: NOW }), [])
    assert.equal(await removeIfUnused({ base, client: client([]), directory: path.join(dirOf(base, A), "sub") }), true)
    assert.deepEqual(await ls(base), [])
  } finally { await done() }
})

test("the event path keeps a folder another session still uses, and ignores foreign directories", async () => {
  const { base, root, done } = await fixture()
  try {
    await folder(base, A, 0)
    const other = { id: "s2", directory: dirOf(base, A) }
    assert.equal(await removeIfUnused({ base, client: client([other]), directory: dirOf(base, A) }), false)
    assert.equal(await removeIfUnused({ base, client: client([]), directory: path.join(root, "x", A, "No project") }), false)
    assert.deepEqual(await ls(base), [A])
  } finally { await done() }
})

test("any listing failure, on any page or list, deletes nothing", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 30 * DAY)
    await folder(base, B, 30 * DAY)
    for (const failAt of [1, 2]) {
      await assert.rejects(sweep({ base, client: client([], (n) => n === failAt), now: NOW }))
      assert.deepEqual(await ls(base), [A, B])
    }
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, directory: "/elsewhere" }))
    await assert.rejects(sweep({ base, client: client(many, (n) => n === 2), now: NOW }))
    assert.deepEqual(await ls(base), [A, B])
    await assert.rejects(removeIfUnused({ base, client: client([], () => true), directory: dirOf(base, A) }))
    assert.deepEqual(await ls(base), [A, B])
  } finally { await done() }
})

test("a repeating cursor is a failure, not an endless loop", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 30 * DAY)
    const loop: SessionLister = { session: { list: async () => ({ data: [], cursor: { next: "same" } }) } }
    await assert.rejects(sweep({ base, client: loop, now: NOW }), /repeated/)
    assert.deepEqual(await ls(base), [A])
  } finally { await done() }
})

test("symlinks are never followed or removed; non-uuid names and a missing No project child are left alone", async () => {
  const { base, root, done } = await fixture()
  try {
    const outside = path.join(root, "outside")
    await mkdir(path.join(outside, "No project"), { recursive: true })
    await writeFile(path.join(outside, "keep.txt"), "k")
    await symlink(outside, path.join(base, A))
    await mkdir(path.join(base, "not-a-uuid", "No project"), { recursive: true })
    await mkdir(path.join(base, B))
    const old = new Date(NOW - 90 * DAY)
    await utimes(path.join(base, B), old, old)
    // A uuid dir whose child is a symlink
    const C = "33333333-3333-4333-8333-333333333333"
    await mkdir(path.join(base, C))
    await symlink(outside, path.join(base, C, "No project"))
    await utimes(path.join(base, C), old, old)
    assert.deepEqual(await sweep({ base, client: client([]), now: NOW }), [])
    assert.deepEqual(await ls(base), [A, B, C, "not-a-uuid"])
    assert.deepEqual(await ls(outside), ["No project", "keep.txt"])
  } finally { await done() }
})

test("a session location that tries to escape the base never maps onto a folder", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 90 * DAY)
    // The "session" claims a path that resolves outside; it must not count as using A, so A (empty, old) is removed.
    const sneaky = [{ id: "s", directory: `${base}/../no-project/${A}/../x/No project` }]
    assert.deepEqual(await sweep({ base, client: client(sneaky), now: NOW }), [A])
  } finally { await done() }
})

test("concurrent sweeps share one run and are idempotent", async () => {
  const { base, done } = await fixture()
  try {
    await folder(base, A, 30 * DAY)
    const c = client([])
    const [x, y] = await Promise.all([sweep({ base, client: c, now: NOW }), sweep({ base, client: c, now: NOW })])
    assert.deepEqual(x, [A])
    assert.deepEqual(y, [A])
    assert.equal(c.calls, 2)
    assert.deepEqual(await sweep({ base, client: c, now: NOW }), [])
  } finally { await done() }
})

test("a missing base dir is an empty sweep without listing", async () => {
  const c = client([])
  assert.deepEqual(await sweep({ base: path.join(tmpdir(), "np-does-not-exist-xyz"), client: c, now: NOW }), [])
  assert.equal(c.calls, 0)
})
