import assert from "node:assert/strict"
import { test } from "node:test"
import { askIdentity, hash, normalise, sameAsk } from "./merge.js"

test("normalising lowercases, drops punctuation and collapses whitespace", () => {
  assert.equal(normalise("  Which  Theme?  Dark,  or light!  "), "which theme dark or light")
  assert.equal(normalise("Über—prüfen (größe)"), "überprüfen größe")
  assert.equal(normalise("   "), "")
})

test("the same words in other case, spacing or punctuation are one text key", () => {
  assert.deepEqual(askIdentity({ question: "Should I merge this?" }), askIdentity({ question: "should i   merge this" }))
  assert.equal(askIdentity({ question: "Should I merge this?" }).scope, "root")
})

test("a ref keys the ask by name, whatever its wording, and across sessions", () => {
  const first = askIdentity({ question: "Continue?", ref: " trial-branch " })
  assert.deepEqual(first, { key: "ref:trial-branch", scope: "all", ref: "trial-branch" })
  assert.equal(sameAsk({ key: "ref:trial-branch", root: "ses_a" }, first, "ses_b"), true)
})

test("a text key matches only within the asker's root family", () => {
  const identity = askIdentity({ question: "Continue?" })
  const stored = { key: identity.key, root: "ses_a" }
  assert.equal(sameAsk(stored, identity, "ses_a"), true, "same family")
  assert.equal(sameAsk(stored, identity, "ses_b"), false, "another project asking the same thing is another ask")
})

test("a hash is stable and short", () => {
  assert.equal(hash("continue"), hash("continue"))
  assert.match(hash("continue"), /^[0-9a-f]{8}$/)
  assert.notEqual(hash("continue"), hash("continue."))
})
