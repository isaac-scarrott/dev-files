import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

test("blindfold carries a byte-identical copy of the contract", () => {
  const mine = readFileSync(new URL("../src/contract.ts", import.meta.url), "utf8")
  const theirs = readFileSync(new URL("../../blindfold/plugin/src/providers-contract.ts", import.meta.url), "utf8")
  assert.equal(theirs, mine)
})
