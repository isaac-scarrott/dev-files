import assert from "node:assert/strict"
import { test } from "node:test"
import { NAME, UUID, directoryOption, readme, scratchDirectory } from "./scratch"

const ID = "11111111-1111-4111-8111-111111111111"

test("each session gets its own folder under the data dir, always named for the sidebar label", () => {
  assert.equal(scratchDirectory("/Users/me", undefined, ID), `/Users/me/.local/share/opencode/no-project/${ID}/No project`)
  assert.equal(scratchDirectory("/Users/me/", undefined, ID).split("/").pop(), NAME)
  const a = scratchDirectory("/h", undefined)
  assert.notEqual(a, scratchDirectory("/h", undefined))
  assert.match(a, new RegExp(`^/h/\\.local/share/opencode/no-project/${UUID.source.slice(1, -1)}/No project$`, "i"))
})

test("an absolute directory option pins one shared folder", () => {
  assert.equal(directoryOption("/data/No project/"), "/data/No project")
  assert.equal(directoryOption(undefined), undefined)
  assert.equal(directoryOption(""), undefined)
  assert.equal(scratchDirectory("/h", directoryOption("/data/x/"), ID), "/data/x")
  assert.equal(scratchDirectory("/h", undefined, ID), `/h/.local/share/opencode/no-project/${ID}/No project`)
})

test("a relative, non-string or dot-segment directory option throws", () => {
  for (const bad of ["relative", 3, null, "/a/../b", "/a/./b", "/..", "/a\0b"]) assert.throws(() => directoryOption(bad), /directory/, String(bad))
})

test("the readme explains the folder", () => {
  assert.match(new TextDecoder().decode(readme()), /No project/)
})
