import assert from "node:assert/strict"
import { test } from "node:test"
import { NAME, readme, scratchDirectory } from "./scratch"

test("default folder sits in Documents of the server's home and is named for the sidebar label", () => {
  assert.equal(scratchDirectory("/Users/me", undefined), "/Users/me/Documents/No project")
  assert.equal(scratchDirectory("/Users/me/", undefined), "/Users/me/Documents/No project")
  assert.equal(scratchDirectory("/Users/me", undefined).split("/").pop(), NAME)
})

test("an absolute directory option wins; a relative or non-string one is ignored", () => {
  assert.equal(scratchDirectory("/h", "/data/No project/"), "/data/No project")
  assert.equal(scratchDirectory("/h", "relative"), "/h/Documents/No project")
  assert.equal(scratchDirectory("/h", 3), "/h/Documents/No project")
})

test("the readme explains the folder", () => {
  assert.match(new TextDecoder().decode(readme()), /No project/)
})
