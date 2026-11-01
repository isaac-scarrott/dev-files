import assert from "node:assert/strict"
import test from "node:test"
import { createLinks, type Deps } from "./links"

function setup(existing: string[], options: { local?: boolean; home?: string | undefined; root?: string } = {}) {
  const checked: string[] = []
  let clock = 0
  let homeCalls = 0

  const deps: Deps = {
    files: () => ({
      root: options.root ?? "/Users/isaac/git/proj",
      local: options.local ?? true,
      resolve: (path) => path,
      exists: async (path) => {
        checked.push(path)
        return existing.includes(path)
      },
    }),
    home: async () => {
      homeCalls++
      return "home" in options ? options.home : "/Users/isaac"
    },
    hostExists: () => false,
    now: () => clock,
  }

  return { links: createLinks(deps), checked, tick: (ms: number) => (clock += ms), homeCalls: () => homeCalls }
}

test("links: ~ expands to the home directory and checks the exact file", async () => {
  const { links, checked } = setup(["/Users/isaac/Movies/x.mp4"])
  assert.equal(await links.target("~/Movies/x.mp4"), "/Users/isaac/Movies/x.mp4")
  assert.deepEqual(checked, ["/Users/isaac/Movies/x.mp4"])
})

test("links: a missing file stays undefined, so the link stays plain", async () => {
  const { links } = setup([])
  assert.equal(await links.target("~/Movies/x.mp4"), undefined)
})

test("links: relative names with spaces use the session directory", async () => {
  const { links } = setup(["/Users/isaac/git/proj/docs/My Notes.md"])
  assert.equal(await links.target("docs/My Notes.md"), "/Users/isaac/git/proj/docs/My Notes.md")
})

test("links: line selection survives", async () => {
  const { links } = setup(["/Users/isaac/a b.md"])
  assert.equal(await links.target("~/a b.md:12"), "/Users/isaac/a b.md#L12")
})

test("links: a remote server's files are not reached with ~", async () => {
  const { links, checked } = setup(["/Users/isaac/a.mp4"], { local: false })
  assert.equal(await links.target("~/a.mp4"), undefined)
  assert.deepEqual(checked, [])
})

test("links: a home lookup that failed means no link", async () => {
  const { links } = setup(["/Users/isaac/a.mp4"], { home: undefined })
  assert.equal(await links.target("~/a.mp4"), undefined)
})

test("links: declined text is never checked", async () => {
  const { links, checked } = setup(["/x/a.png"])
  assert.equal(links.match("docs/a.md"), false)
  assert.equal(await links.target("docs/a.md"), undefined)
  assert.deepEqual(checked, [])
})

test("links: hits and misses are cached, misses for less time", async () => {
  const { links, checked, tick } = setup(["/Users/isaac/a.mp4"])
  await links.target("~/a.mp4")
  await links.target("~/a.mp4")
  await links.target("~/b.mp4")
  await links.target("~/b.mp4")
  assert.equal(checked.length, 2)
  assert.equal(links.peek("~/a.mp4"), "/Users/isaac/a.mp4")
  assert.equal(links.peek("~/b.mp4"), undefined)
  tick(6_000)
  await links.target("~/b.mp4")
  assert.equal(checked.length, 3)
  await links.target("~/a.mp4")
  assert.equal(checked.length, 3)
  tick(60_000)
  assert.equal(links.peek("~/a.mp4"), undefined)
})

test("links: the cache is bounded", async () => {
  const { links, checked } = setup([])
  for (let index = 0; index < 700; index++) await links.target(`~/f${index}.mp4`)
  checked.length = 0
  await links.target("~/f0.mp4")
  assert.equal(checked.length, 1)
})

test("links: no session means no answer", async () => {
  const links = createLinks({ files: () => undefined, home: async () => "/h", hostExists: () => false, now: () => 0 })
  assert.equal(await links.target("~/a.mp4"), undefined)
})
