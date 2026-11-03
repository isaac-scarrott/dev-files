import assert from "node:assert/strict"
import { test } from "node:test"
import { normalize, type NotifyInput } from "../../native-ui/src/notify-contract"
import { Ledger, MAX_ENTRIES, markEntries, markEntry, order, pickNext, stops, urgentCount, type Candidate } from "./ledger"

const n = (input: NotifyInput, source = "monitor", at = 1) => normalize({ ...input, target: input.target ?? { server: "s", session: "a" }, at }, source)!
const make = () => {
  let changes = 0
  const ledger = new Ledger(() => changes++)
  return { ledger, changes: () => changes }
}

test("put replaces the same (source, key), needs a target, and reports each change once", () => {
  const { ledger, changes } = make()
  ledger.put(n({ kind: "info", title: "one", key: "k" }), false)
  ledger.put(n({ kind: "error", title: "two", key: "k" }), false)
  assert.equal(ledger.list().length, 1)
  assert.equal(ledger.list()[0]!.title, "two")
  ledger.put(normalize({ kind: "info", title: "no target" }, "x")!, false)
  assert.equal(ledger.list().length, 1)
  assert.equal(changes(), 2)
  assert.equal(ledger.remove("monitor", "k"), true)
  assert.equal(ledger.remove("monitor", "k"), false)
  assert.equal(changes(), 3)
})

test("opening a session clears what waits on it except a request that still needs an answer", () => {
  const { ledger } = make()
  ledger.put(n({ kind: "done", title: "d", key: "1" }), true)
  ledger.put(n({ kind: "info", title: "i", key: "2" }), false)
  ledger.put(n({ kind: "needs-you", title: "q", key: "3", persistent: true }), true)
  ledger.put(n({ kind: "error", title: "other", key: "4", target: { server: "s", session: "b" } }), true)
  assert.equal(ledger.clearSession({ server: "s", session: "a" }), 2)
  assert.deepEqual(ledger.list().map((entry) => entry.key).sort(), ["3", "4"])
  assert.equal(ledger.clearSession({ server: "s", session: "zzz" }), 0)
})

test("a flood is capped, dropping the oldest transient entries and keeping requests", () => {
  const { ledger } = make()
  ledger.put(n({ kind: "needs-you", title: "q", key: "q", persistent: true }), true)
  for (let index = 0; index < MAX_ENTRIES + 50; index++) ledger.put(n({ kind: "done", title: "d", key: `k${index}`, target: { server: "s", session: `x${index}` } }, "monitor", index + 2), true)
  assert.equal(ledger.list().length, MAX_ENTRIES)
  assert.ok(ledger.list().some((entry) => entry.key === "q"))
  assert.ok(!ledger.list().some((entry) => entry.key === "k0"))
  assert.ok(ledger.list().some((entry) => entry.key === `k${MAX_ENTRIES + 49}`))
})

test("only plugin-sourced, non-persistent entries are stored, and a stored one comes back as a plain entry", () => {
  const { ledger } = make()
  ledger.put(n({ kind: "info", title: "keep", key: "1" }), false)
  ledger.put(n({ kind: "done", title: "host", key: "2" }), true)
  ledger.put(n({ kind: "needs-you", title: "req", key: "3", persistent: true }), false)
  const stored = ledger.stored()
  assert.deepEqual(stored.map((entry) => entry.key), ["1"])
  const fresh = make()
  fresh.ledger.load(stored)
  fresh.ledger.load(stored)
  assert.equal(fresh.ledger.list().length, 1, "loading twice adds nothing")
  assert.equal(fresh.ledger.list()[0]!.host, false)
})

test("the titlebar counts sessions with a needs-you or error, once each, never done or info", () => {
  const { ledger } = make()
  ledger.put(n({ kind: "error", title: "e", key: "1" }), true)
  ledger.put(n({ kind: "needs-you", title: "q", key: "2" }), true)
  ledger.put(n({ kind: "done", title: "d", key: "3", target: { server: "s", session: "b" } }), true)
  ledger.put(n({ kind: "info", title: "i", key: "4", target: { server: "s", session: "c" } }), false)
  ledger.put(n({ kind: "error", title: "e2", key: "5", target: { server: "s", session: "d" } }), true)
  assert.equal(urgentCount(ledger.list()), 2)
})

test("a tab's mark is the highest plugin-sourced kind whose Mark switch is on; host entries never draw one", () => {
  const { ledger } = make()
  const ref = { server: "s", session: "a" }
  ledger.put(n({ kind: "info", title: "info", key: "1" }, "monitor", 5), false)
  ledger.put(n({ kind: "error", title: "error", key: "2" }, "scheduler", 3), false)
  ledger.put(n({ kind: "needs-you", title: "host asks", key: "3" }, "notifications", 1), true)
  const on = () => true
  assert.equal(markEntry(ledger.list(), ref, on)?.title, "error")
  assert.equal(markEntry(ledger.list(), ref, (kind) => kind !== "error")?.title, "info")
  assert.equal(markEntry(ledger.list(), ref, () => false), undefined)
  assert.equal(markEntry(ledger.list(), { server: "s", session: "other" }, on), undefined)
  const marks = markEntries(ledger.list(), on)
  assert.equal(marks.size, 1)
  assert.equal([...marks.values()][0]!.title, "error")
})

const c = (session: string, kind: Candidate["kind"], at: number): Candidate => ({ server: "s", session, kind, at })

test("the order is needs-you, then error, then done, oldest first, one stop per session at its highest kind; info is not a stop", () => {
  const list = order([c("d1", "done", 1), c("e1", "error", 5), c("n2", "needs-you", 9), c("n1", "needs-you", 2), c("e1", "done", 1), c("n1", "error", 1), c("e0", "error", 3)])
  assert.deepEqual(list.map((x) => x.session), ["n1", "n2", "e0", "e1", "d1"])
  const { ledger } = make()
  ledger.put(n({ kind: "info", title: "i", key: "1" }), false)
  assert.deepEqual(stops(ledger.list()), [])
})

test("pickNext skips the session on screen and walks the whole list on repeated presses", () => {
  const list = order([c("a", "needs-you", 1), c("b", "needs-you", 2), c("c", "needs-you", 3)])
  const ref = (session: string) => ({ server: "s", session })
  assert.equal(pickNext(list)?.session, "a")
  assert.equal(pickNext(list, ref("a"))?.session, "b", "the open session is not a stop")
  assert.equal(pickNext(list, ref("a"), ref("a"))?.session, "b")
  assert.equal(pickNext(list, ref("b"), ref("a"))?.session, "c", "after the last visited, not back to the first")
  assert.equal(pickNext(list, ref("c"), ref("b"))?.session, "a", "wraps")
  assert.equal(pickNext(list, ref("a"), ref("gone"))?.session, "b")
  // The visited stop was cleared (an error, a finished run): its place in the previous walk still says where to go next.
  const before = order([c("n", "needs-you", 1), c("e", "error", 2), c("d", "done", 3)])
  const after = order([c("n", "needs-you", 1), c("d", "done", 3)])
  assert.equal(pickNext(after, ref("e"), ref("e"), before)?.session, "d", "not back to the request that never clears")
  assert.equal(pickNext(order([c("n", "needs-you", 1)]), ref("d"), ref("d"), before)?.session, "n", "wraps")
  assert.equal(pickNext([c("a", "done", 1)], ref("a")), undefined, "only the open session: nowhere to go, the key is declined")
  assert.equal(pickNext([]), undefined)
})
