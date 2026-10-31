import assert from "node:assert/strict"
import { test } from "node:test"
import { avatarFor } from "./avatar"

test("avatar follows the app's precedence: image, colour, then a letter on gray", () => {
  assert.deepEqual(avatarFor({ icon: { url: "u", override: "o" } }, "/a/repo"), { letter: "r", src: "o", variant: "gray" })
  assert.deepEqual(avatarFor({ icon: { color: "mint", url: "u" } }, "/a/repo/"), { letter: "r", src: undefined, variant: "cyan" })
  assert.deepEqual(avatarFor(undefined, "/a/Zed"), { letter: "Z", src: undefined, variant: "gray" })
  assert.deepEqual(avatarFor(undefined, ""), { letter: "", src: undefined, variant: "gray" })
})
