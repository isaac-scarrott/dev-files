import assert from "node:assert/strict"
import { test } from "node:test"
import type { PendingRequest } from "../../native-ui/src/requests.js"
import { buildRows, formatAge, type SessionView } from "./rows.js"
import type { AskView } from "./rpc.js"

const request = (over: Partial<PendingRequest> = {}): PendingRequest => ({
  server: "sidecar",
  session: "ses_1",
  root: "ses_1",
  kind: "permission",
  id: "per_1",
  text: "bash git status",
  createdAt: 0,
  ...over,
})

const ask = (over: Partial<AskView> = {}): AskView => ({
  id: 4,
  session: "ses_1",
  root: "ses_1",
  question: "Should I merge?",
  blocking: true,
  createdAt: 1_000,
  lastAskedAt: 1_000,
  asks: 1,
  ...over,
})

const sessions: Record<string, SessionView> = {
  "sidecar/ses_1": { title: "Fix the parser", project: "dev-files", root: "ses_1", running: false },
  "sidecar/ses_child": { title: "Subagent", project: "dev-files", root: "ses_1", running: false },
  "sidecar/ses_busy": { title: "Long run", project: "dev-files", root: "ses_1", running: true },
}

function build(over: Partial<Parameters<typeof buildRows>[0]> = {}) {
  return buildRows({
    now: 601_000,
    builtin: "sidecar",
    requests: [],
    asks: [],
    session: (server, id) => sessions[`${server}/${id}`],
    family: () => ["ses_1", "ses_child", "ses_busy"],
    firstSeen: new Map(),
    seen: new Map(),
    ...over,
  })
}

test("a permission names its project and session, waits for an age, and blocks", () => {
  const rows = build({ requests: [request()], firstSeen: new Map([["host:sidecar:permission:per_1", 1_000]]) })
  assert.deepEqual(rows[0], {
    key: "host:sidecar:permission:per_1",
    server: "sidecar",
    session: "ses_1",
    root: "ses_1",
    project: "dev-files",
    title: "Fix the parser",
    kind: "permission",
    id: "per_1",
    text: "bash git status",
    createdAt: 1_000,
    ageMin: 10,
    asks: 1,
    blocked: true,
    waiters: 1,
  })
})

test("only question forms are listed, and forms asking the same thing are counted, not merged", () => {
  const rows = build({
    requests: [request({ kind: "form", id: "frm_a", formKind: "question", text: "Dark or light?" }), request({ kind: "form", id: "frm_b", formKind: "question", text: "dark, or LIGHT" }), request({ kind: "form", id: "frm_c", formKind: "mcp-elicitation", text: "Sign in" })],
  })
  assert.deepEqual(rows.map((row) => row.id), ["frm_a", "frm_b"])
  assert.deepEqual(rows.map((row) => row.asks), [2, 2], "a built-in question re-ask is counted")
  assert.deepEqual(rows.map((row) => row.blocked), [true, true])
})

test("an ask_isaac comes from the builtin server, keeps its number, and blocks only when it blocks an idle session", () => {
  const idle = build({ asks: [ask()] })[0]!
  assert.equal(idle.kind, "ask")
  assert.equal(idle.server, "sidecar")
  assert.equal(idle.askId, 4)
  assert.equal(idle.id, "4")
  assert.equal(idle.blocked, true)
  assert.equal(idle.ageMin, 10)
  const busy = build({ asks: [ask()], session: () => ({ title: "Busy", project: "p", root: "ses_1", running: true }) })[0]!
  assert.equal(busy.blocked, false, "the model is still working, so nothing waits on the answer")
  const optional = build({ asks: [ask({ blocking: false })] })[0]!
  assert.equal(optional.blocked, false)
})

test("waiters are the idle members of the asker's family, never the asker", () => {
  const rows = build({ requests: [request()], asks: [ask({ session: "ses_child", root: "ses_1" })] })
  assert.equal(rows[0]!.waiters, 1, "ses_1 is idle and ses_busy is running")
  assert.equal(rows[1]!.waiters, 1, "from the subagent, the root is idle and the busy one is not")
})

test("a host request seen for the first time starts now, and the seen map remembers it", () => {
  const seen = new Map<string, number>()
  const first = buildRows({ now: 5_000, builtin: "sidecar", requests: [request()], asks: [], session: () => undefined, family: () => [], firstSeen: new Map(), seen })
  assert.equal(first[0]!.createdAt, 5_000)
  assert.deepEqual([...seen.entries()], [["host:sidecar:permission:per_1", 5_000]])
  const later = buildRows({ now: 65_000, builtin: "sidecar", requests: [], asks: [], session: () => undefined, family: () => [], firstSeen: new Map(), seen })
  assert.deepEqual(later, [])
  assert.equal(seen.size, 0, "a row that went away is forgotten")
})

test("ages stay compact", () => {
  assert.equal(formatAge(30_000), "now")
  assert.equal(formatAge(5 * 60_000), "5m")
  assert.equal(formatAge(2 * 3_600_000), "2h")
  assert.equal(formatAge(3 * 86_400_000), "3d")
})
