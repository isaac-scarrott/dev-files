import assert from "node:assert/strict"
import { test } from "node:test"
import { isLocationGone } from "./location"

test("a host answer for a deleted folder is recognised in each shape the client can throw", () => {
  assert.equal(isLocationGone({ _tag: "LocationNotFoundError", message: "Location not found: /x" }), true)
  const named = new Error("Location not found: /x"); named.name = "LocationNotFoundError"
  assert.equal(isLocationGone(named), true)
  assert.equal(isLocationGone(new Error("LocationNotFoundError: Location not found: /x")), true)
  assert.equal(isLocationGone("LocationNotFoundError: Location not found: /x"), true)
})

test("other failures are not mistaken for a deleted folder", () => {
  assert.equal(isLocationGone(new Error("Server did not confirm archive state")), false)
  assert.equal(isLocationGone({ _tag: "SessionNotFoundError" }), false)
  assert.equal(isLocationGone(undefined), false)
  assert.equal(isLocationGone(null), false)
  assert.equal(isLocationGone(404), false)
})
