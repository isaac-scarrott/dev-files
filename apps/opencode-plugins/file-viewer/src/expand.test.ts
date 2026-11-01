import assert from "node:assert/strict"
import test from "node:test"
import { claim, expand } from "./expand"

const where = { home: "/Users/isaac", base: "/Users/isaac/git/proj" }

const claimed = (href: string) => claim(href)?.reason

test("claim: the host refuses ~ paths, so the plugin takes them", () => {
  assert.equal(claimed("~/Movies/holibob-creator-onboarding-v11.mp4"), "tilde")
  assert.equal(claimed("~/a.md:12"), "tilde")
  assert.equal(claimed("~/a.png#L3"), "tilde")
  assert.equal(claimed("$HOME/Movies/a.mp4"), "tilde")
  assert.equal(claimed("${HOME}/a.csv"), "tilde")
})

test("claim: names with spaces are taken", () => {
  assert.equal(claimed("~/Movies/My Video.mp4"), "tilde")
  assert.equal(claimed("/Users/isaac/Movies/My Video.mp4"), "spaced")
  assert.equal(claimed("docs/My Notes.md"), "spaced")
  assert.equal(claimed("./docs/My Notes.md:4"), "spaced")
  assert.equal(claimed("Final Report.pdf"), "spaced")
})

test("claim: everything the host already handles is declined", () => {
  for (const href of [
    "docs/a.md",
    "/Users/isaac/a.png",
    "./a.md",
    "../a.md",
    "a.png",
    "src/app.ts:42",
    "https://example.com/a.png",
    "C:\\Users\\a.png",
    "~root/a.png",
    "~/bin/run",
    "~",
    "~/",
    "$OTHER/a.png",
    "ffplay ~/a.mp4",
    "open a.mp4",
    "some words here",
    "My Folder/unknown.zzz",
    "",
  ]) {
    assert.equal(claim(href), undefined, href)
  }
})

test("claim: long text is declined without parsing", () => {
  assert.equal(claim(`~/${"a".repeat(2000)}.mp4`), undefined)
})

test("expand: ~ and $HOME", () => {
  const read = (href: string) => {
    const found = claim(href)
    assert.ok(found, href)
    return expand(found.candidate, where)
  }

  assert.deepEqual(read("~/Movies/x.mp4"), { ok: true, absolute: "/Users/isaac/Movies/x.mp4", href: "/Users/isaac/Movies/x.mp4" })
  assert.deepEqual(read("$HOME/x.mp4"), { ok: true, absolute: "/Users/isaac/x.mp4", href: "/Users/isaac/x.mp4" })
  assert.deepEqual(read("${HOME}/a b.md#L3-L9"), { ok: true, absolute: "/Users/isaac/a b.md", href: "/Users/isaac/a b.md#L3-L9" })
  assert.deepEqual(read("~/a.md:12:3"), { ok: true, absolute: "/Users/isaac/a.md", href: "/Users/isaac/a.md#L12" })
  assert.deepEqual(read("~/../x.md").ok && (read("~/../x.md") as { absolute: string }).absolute, "/Users/x.md")
})

test("expand: relative paths resolve against the session directory and normalise", () => {
  const read = (href: string) => {
    const found = claim(href)
    assert.ok(found, href)
    return expand(found.candidate, where)
  }

  assert.equal((read("docs/My Notes.md") as { absolute: string }).absolute, "/Users/isaac/git/proj/docs/My Notes.md")
  assert.equal((read("./docs/../docs/My Notes.md") as { absolute: string }).absolute, "/Users/isaac/git/proj/docs/My Notes.md")
  assert.equal((read("../My Notes.md") as { absolute: string }).absolute, "/Users/isaac/git/My Notes.md")
  assert.equal((read("/tmp/x/../My Notes.md") as { absolute: string }).absolute, "/tmp/My Notes.md")
  assert.equal((read("Final Report.pdf") as { absolute: string }).absolute, "/Users/isaac/git/proj/Final Report.pdf")
})

test("expand: ~ without a home is not guessed", () => {
  const found = claim("~/a.mp4")!
  assert.deepEqual(expand(found.candidate, { base: "/x" }), { ok: false, reason: "no-home" })
})
