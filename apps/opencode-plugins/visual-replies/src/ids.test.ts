import assert from "node:assert/strict"
import { test } from "node:test"
import { entryOf, mapParts, rowLabel, type ArtifactInfo, type ToolPart } from "./ids"

const info = (id: string, created: number, updated = created, title = id): ArtifactInfo => ({ id, title, time: { created, updated } })
const direct = (id: string, name: string, input: Record<string, unknown>, text: string, status = "completed"): ToolPart => ({
  type: "tool",
  id,
  name,
  state: { status, input, content: [{ type: "text", text }] },
})
const execute = (id: string, calls: { tool: string; input?: Record<string, unknown>; status?: string }[], text: string, time: ToolPart["time"], status = "completed"): ToolPart => ({
  type: "tool",
  id,
  name: "execute",
  state: { status, input: { code: "..." }, content: [{ type: "text", text }], metadata: { toolCalls: calls.map((call) => ({ status: "completed", ...call })) } },
  time,
})

test("a direct artifact_create reads its id from the result text and carries its page", () => {
  const part = direct("t1", "artifact_create", { title: "Rev", files: { "index.html": "<p>x</p>" } }, "Published Rev (art_AAA via local): /api/experimental/artifacts/art_AAA/view/")
  const { placements, settled } = mapParts([part], [])
  assert.deepEqual(placements.get("t1"), [{ callID: "t1", kind: "card", artifactID: "art_AAA", title: "Rev", carried: { title: "Rev", html: "<p>x</p>" } }])
  assert.ok(settled.has("t1"))
})

test("a direct artifact_update is a row with its id from the input", () => {
  const part = direct("t2", "artifact_update", { id: "art_AAA", title: "Rev v2", files: { "index.html": "x" } }, "Updated Rev v2 (art_AAA): /x")
  assert.deepEqual(mapParts([part], []).placements.get("t2"), [{ callID: "t2", kind: "update", artifactID: "art_AAA", title: "Rev v2" }])
})

test("running parts are neither placed nor settled; errors settle without a placement", () => {
  const running = direct("r", "artifact_create", { title: "x", files: { a: "b" } }, "", "running")
  const failed = direct("f", "artifact_create", { title: "x", files: { a: "b" } }, "boom", "error")
  const other = direct("o", "read", { path: "a" }, "text")
  const scan = mapParts([running, failed, other], [])
  assert.equal(scan.placements.size, 0)
  assert.deepEqual([...scan.settled].sort(), ["f", "o"])
})

test("Code Mode: the id the model returned from execute is used", () => {
  const part = execute("e1", [{ tool: "opencode.artifact_create", input: { title: "T", files: { "index.html": "<b>1</b>" } } }], '{"id":"art_RET","title":"T"}', { created: 1000, completed: 2000 })
  const [placement] = mapParts([part], [info("art_OTHER", 1500)]).placements.get("e1")!
  assert.equal(placement!.artifactID, "art_RET")
  assert.equal(placement!.kind, "card")
  assert.equal(placement!.carried?.html, "<b>1</b>")
})

test("Code Mode: without a returned id the artifact the session gained during the call is used", () => {
  const part = execute("e2", [{ tool: "opencode.artifact_create" }], "", { created: 10_000, ran: 10_100, completed: 12_000 })
  const artifacts = [info("art_OLD", 1000), info("art_IN", 11_000), info("art_LATE", 20_000)]
  assert.equal(mapParts([part], artifacts).placements.get("e2")![0]!.artifactID, "art_IN")
  const edge = info("art_EDGE", 10_100 - 300)
  assert.equal(mapParts([part], [edge]).placements.get("e2")![0]!.artifactID, "art_EDGE")
  assert.equal(mapParts([part], [info("art_FAR", 10_100 - 301)]).placements.get("e2")![0]!.artifactID, undefined)
})

test("Code Mode: two creates take ids in call order; the card still renders from its input when no id exists", () => {
  const files = (html: string) => ({ title: html, files: { "index.html": html } })
  const part = execute("e3", [{ tool: "opencode.artifact_create", input: files("a") }, { tool: "opencode.artifact_create", input: files("b") }], "", { created: 0, completed: 5000 })
  const two = mapParts([part], [info("art_2", 2000), info("art_1", 1000)]).placements.get("e3")!
  assert.deepEqual(two.map((item) => item.artifactID), ["art_1", "art_2"])
  const deleted = mapParts([part], []).placements.get("e3")!
  assert.deepEqual(deleted.map((item) => [item.artifactID, item.carried?.html]), [[undefined, "a"], [undefined, "b"]])
})

test("Code Mode: updates use their input id, never the window, and repeated updates make one row", () => {
  const update = { tool: "opencode.artifact_update", input: { id: "art_U", title: "v3" } }
  const part = execute("e4", [update, update, { tool: "opencode.artifact_read", input: { id: "art_U" } }], "", { created: 0, completed: 5000 })
  const placements = mapParts([part], [info("art_U", 100, 4000)]).placements.get("e4")!
  assert.deepEqual(placements, [{ callID: "e4", kind: "update", artifactID: "art_U", title: "v3" }])
})

test("Code Mode: execute without artifact calls, or with failed ones, places nothing", () => {
  assert.equal(mapParts([execute("e5", [{ tool: "opencode.read" }], "", {})], []).placements.size, 0)
  assert.equal(mapParts([execute("e6", [{ tool: "opencode.artifact_create", status: "error" }], "", {})], []).placements.size, 0)
})

test("a returned id that an update targets is not taken as the new page", () => {
  const part = execute("e7", [{ tool: "opencode.artifact_update", input: { id: "art_U" } }, { tool: "opencode.artifact_create" }], "art_U art_N", { created: 0, completed: 10 })
  const placements = mapParts([part], []).placements.get("e7")!
  assert.deepEqual(placements.map((item) => [item.kind, item.artifactID]), [["update", "art_U"], ["card", "art_N"]])
})

test("entryOf follows the host's entry rules", () => {
  assert.equal(entryOf({ "a.html": "A", "index.html": "I" }), "I")
  assert.equal(entryOf({ "a.html": "A" }), "A")
  assert.equal(entryOf({ "a.html": "A", "b.html": "B" }), undefined)
  assert.equal(entryOf({ "a.html": "A", "b.html": "B" }, "b.html"), "B")
  assert.equal(entryOf(undefined), undefined)
})

test("an update row says the update's title, else the artifact's", () => {
  assert.equal(rowLabel({ callID: "c", kind: "update", title: "New" }, { title: "Old" }), "New")
  assert.equal(rowLabel({ callID: "c", kind: "update" }, { title: "Old" }), "Old")
  assert.equal(rowLabel({ callID: "c", kind: "update" }), "")
})

test("adjacent calls never share an artifact: one created while a call ran belongs to that call, not its neighbour's allowance", () => {
  const first = execute("p1", [{ tool: "opencode.artifact_create", input: { title: "gone", files: { "index.html": "g" } } }, { tool: "opencode.artifact_delete" }], "{}", { created: 1000, ran: 1000, completed: 1100 })
  const second = execute("p2", [{ tool: "opencode.artifact_create" }], "", { created: 1200, ran: 1200, completed: 1300 })
  const scan = mapParts([second, first], [info("art_2", 1250)])
  assert.equal(scan.placements.get("p1")![0]!.artifactID, undefined, "its artifact was deleted: it stays id-less and renders from its call")
  assert.equal(scan.placements.get("p2")![0]!.artifactID, "art_2")
})

test("a near miss is used only when no artifact was created inside the call", () => {
  const first = execute("p1", [{ tool: "opencode.artifact_create" }], "", { created: 1000, ran: 1000, completed: 1100 })
  const second = execute("p2", [{ tool: "opencode.artifact_create" }], "", { created: 1200, ran: 1200, completed: 1300 })
  const scan = mapParts([first, second], [info("art_near", 1450), info("art_in", 1250)])
  assert.equal(scan.placements.get("p2")![0]!.artifactID, "art_in")
  assert.equal(scan.placements.get("p1")![0]!.artifactID, undefined, "art_near is outside p1's allowance")
  const alone = mapParts([first], [info("art_late", 1350)])
  assert.equal(alone.placements.get("p1")![0]!.artifactID, "art_late", "within the allowance and unclaimed")
})

test("an id a result names is never taken by another call's window", () => {
  const named = direct("d1", "artifact_create", { title: "n", files: { "index.html": "n" } }, "Published n (art_N via local): u")
  const window = execute("w1", [{ tool: "opencode.artifact_create" }], "", { created: 0, ran: 0, completed: 500 })
  const scan = mapParts([window, named], [info("art_N", 200)])
  assert.equal(scan.placements.get("d1")![0]!.artifactID, "art_N")
  assert.equal(scan.placements.get("w1")![0]!.artifactID, undefined)
})
