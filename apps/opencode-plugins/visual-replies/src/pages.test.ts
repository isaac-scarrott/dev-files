import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createPageStore, embedImages, limits, PublishError, validate, type KeyValueStore } from "./pages"
import server, { createTool } from "./server"

function memory(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
    scan: async ({ prefix, after, limit = 100 }) => {
      const keys = [...data.keys()].filter((key) => key.startsWith(prefix)).sort().filter((key) => !after || key > after)
      const slice = keys.slice(0, limit)
      return {
        entries: slice.map((key) => ({ key, value: data.get(key) })),
        next: keys.length > limit ? slice.at(-1) : undefined,
      }
    },
  }
}

test("validate trims the title and rejects bad input", () => {
  assert.deepEqual(validate({ title: "  Hi ", html: "<p>x</p>" }), { title: "Hi", html: "<p>x</p>", images: [] })
  for (const bad of [null, {}, { title: "", html: "x" }, { title: "t", html: " " }, { title: "x".repeat(121), html: "x" }]) {
    assert.throws(() => validate(bad), PublishError)
  }
  assert.throws(() => validate({ title: "t", html: "x".repeat(limits.html + 1) }), PublishError)
  assert.throws(() => validate({ title: "t", html: "x", images: Array(limits.images + 1).fill("a.png") }), PublishError)
  assert.throws(() => validate({ title: "t", html: "x", images: [1] }), PublishError)
})

test("embedImages inlines referenced images and enforces type and size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vr-"))
  await writeFile(join(dir, "a.png"), Buffer.from([1, 2, 3]))
  await writeFile(join(dir, "unused.png"), Buffer.from([9]))
  await writeFile(join(dir, "big.png"), Buffer.alloc(limits.imageBytes + 1))
  await writeFile(join(dir, "notes.txt"), "secret")

  const result = await embedImages('<img src="a.png"><img src="a.png">', ["a.png", "unused.png"], dir)
  assert.equal(result.html, `<img src="data:image/png;base64,AQID"><img src="data:image/png;base64,AQID">`)
  assert.deepEqual(result.unreferenced, ["unused.png"])
  assert.equal((await embedImages(`<img src="${join(dir, "a.png")}">`, [join(dir, "a.png")], "/")).unreferenced.length, 0)

  await assert.rejects(embedImages("x", ["big.png"], dir), /over/)
  await assert.rejects(embedImages("x", ["notes.txt"], dir), /only/)
  await assert.rejects(embedImages("x", ["missing.png"], dir), /no such/)
})

test("store round-trips, lists in order, caps per session, and removes a session", async () => {
  const kv = memory()
  let clock = 0
  const store = createPageStore(kv, () => ++clock)
  await store.put({ sessionID: "s1", callID: "c1", title: "One", html: "<p>1</p>" })
  await store.put({ sessionID: "s1", callID: "c2", title: "Two", html: "<p>2</p>" })
  await store.put({ sessionID: "s2", callID: "c3", title: "Other", html: "<p>3</p>" })

  assert.equal((await store.get("c1"))?.html, "<p>1</p>")
  assert.deepEqual((await store.list("s1")).map((page) => page.callID), ["c1", "c2"])
  await assert.rejects(store.put({ sessionID: "s1", callID: "c9", title: "t", html: "x".repeat(limits.totalBytes + 1) }), PublishError)

  await store.removeSession("s1")
  assert.equal(await store.get("c1"), undefined)
  assert.deepEqual(await store.list("s1"), [])
  assert.equal((await store.get("c3"))?.title, "Other")
  assert.deepEqual([...kv.data.keys()].sort(), ["page/c3", "session/s2/c3"])

  const full = memory()
  const capped = createPageStore(full)
  for (let i = 0; i < limits.pagesPerSession; i++) await capped.put({ sessionID: "s", callID: `c${i}`, title: "t", html: "x" })
  await assert.rejects(capped.put({ sessionID: "s", callID: "extra", title: "t", html: "x" }), /already has/)
  await capped.put({ sessionID: "s", callID: "c0", title: "again", html: "y" })
})

test("publish_html stores under the call id and announces it", async () => {
  const store = createPageStore(memory())
  const announced: string[][] = []
  const tool = createTool(store, "/", async (sessionID, callID) => void announced.push([sessionID, callID]))
  const result = await tool.execute({ title: "Chart", html: "<svg></svg>" }, { sessionID: "s1", id: "call_1" })
  assert.match(result.content, /Published "Chart"/)
  assert.deepEqual(announced, [["s1", "call_1"]])
  assert.equal((await store.get("call_1"))?.sessionID, "s1")
  await assert.rejects(tool.execute({ title: "", html: "x" }, { sessionID: "s1", id: "call_2" }), /title/)
  assert.equal(await store.get("call_2"), undefined)
  assert.equal(tool.input.additionalProperties, false)
})

test("server part has a stable id", () => {
  assert.equal(server.id, "visual-replies")
})
