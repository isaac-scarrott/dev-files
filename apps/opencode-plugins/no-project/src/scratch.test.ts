import assert from "node:assert/strict"
import { test } from "node:test"
import { NAME, UUID, pinnedDirectory, readme, scratchDirectory } from "./scratch"

const ID = "11111111-1111-4111-8111-111111111111"

test("each session gets its own folder under the data dir, always named for the sidebar label", () => {
  assert.equal(scratchDirectory("/Users/me", undefined, ID), `/Users/me/.local/share/opencode/no-project/${ID}/No project`)
  assert.equal(scratchDirectory("/Users/me/", undefined, ID).split("/").pop(), NAME)
  const a = scratchDirectory("/h", undefined)
  assert.notEqual(a, scratchDirectory("/h", undefined))
  assert.match(a, new RegExp(`^/h/\\.local/share/opencode/no-project/${UUID.source.slice(1, -1)}/No project$`, "i"))
})

test("an absolute directory option pins one shared folder; a relative or non-string one is ignored", () => {
  assert.equal(scratchDirectory("/h", "/data/No project/"), "/data/No project")
  assert.equal(pinnedDirectory("/data/x/"), "/data/x")
  assert.equal(pinnedDirectory("relative"), undefined)
  assert.equal(scratchDirectory("/h", "relative", ID), `/h/.local/share/opencode/no-project/${ID}/No project`)
  assert.equal(scratchDirectory("/h", 3, ID), `/h/.local/share/opencode/no-project/${ID}/No project`)
})

test("the readme explains the folder", () => {
  assert.match(new TextDecoder().decode(readme()), /No project/)
})
