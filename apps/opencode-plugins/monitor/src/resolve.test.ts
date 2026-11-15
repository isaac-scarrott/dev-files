import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveMonitor } from "./resolve.js"

const known = [
  { id: "mon_a", name: "vitest-flags", session: "ses_me" },
  { id: "mon_b", name: "deploy", session: "ses_me" },
  { id: "mon_c", name: "vitest-flags", session: "ses_other" },
]

test("an id means itself, whoever it belongs to", () => {
  assert.deepEqual(resolveMonitor(known, "mon_b", "ses_me"), { id: "mon_b" })
  assert.deepEqual(resolveMonitor(known, "mon_c", "ses_me"), { id: "mon_c" })
  assert.deepEqual(resolveMonitor(known, "mon_a", "ses_other"), { id: "mon_a" })
})

test("a name means the one monitor of the caller's session that has it", () => {
  assert.deepEqual(resolveMonitor(known, "vitest-flags", "ses_me"), { id: "mon_a" })
  assert.deepEqual(resolveMonitor(known, "deploy", "ses_other"), { reason: "unknown", candidates: [], own: [known[2]] })
})

test("a name matching two of the caller's monitors is ambiguous, not guessed", () => {
  const twins = [...known, { id: "mon_d", name: "tests", session: "ses_me" }, { id: "mon_e", name: "tests", session: "ses_me" }]
  const resolution = resolveMonitor(twins, "tests", "ses_me")
  assert.equal("reason" in resolution && resolution.reason, "ambiguous")
  assert.deepEqual("candidates" in resolution ? resolution.candidates.map((monitor) => monitor.id) : [], ["mon_d", "mon_e"])
})
