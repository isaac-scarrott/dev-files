import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { NAMESPACE, registerTools } from "./tools.js"
import { DEFAULTS } from "./options.js"

test("registers start, list and stop under the monitor namespace", () => {
  const added: any[] = []
  const editor = { namespace: (n: unknown) => void added.push({ namespace: n }), add: (t: any) => void added.push(t) }
  registerTools(editor as never, {} as never, {} as never, DEFAULTS)
  assert.equal(NAMESPACE, "monitor")
  assert.equal(added[0].namespace.name, "monitor")
  const tools = added.slice(1)
  assert.deepEqual(tools.map((t) => t.name), ["start", "list", "stop"])
  for (const t of tools) assert.equal(t.options.namespace, "monitor")
  assert.equal(tools[0].options.codemode, true)
  assert.equal(tools[0].options.permission, "shell")
})

test("start tells the agent each line is shown to the user as one short plain sentence", () => {
  const added: any[] = []
  registerTools({ namespace() {}, add: (t: any) => void added.push(t) } as never, {} as never, {} as never, DEFAULTS)
  const start = added.find((t) => t.name === "start")
  assert.match(start.description, /one-line row/)
  assert.ok(start.description.slice(0, 117).includes("shown to the user"), "the catalog shows only the first 117 characters of a description")
  assert.match(start.input.properties.command.description, /Good: `Deploy #8216 succeeded in 4m`/)
  assert.match(start.input.properties.name.description, /Human label/)
  assert.match(start.input.properties.command.description, /no raw ids/)
})

test("start resolves cwd against the session's directory, and takes an absolute path as given", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "monitor-cwd-"))
  mkdirSync(path.join(root, "sub"))
  const outside = mkdtempSync(path.join(os.tmpdir(), "monitor-outside-"))
  const started: any[] = []
  const asserted: any[] = []
  const added: any[] = []
  registerTools(
    { namespace() {}, add: (t: any) => void added.push(t) } as never,
    { start: async (input: any) => { started.push(input); return input } } as never,
    {
      session: { get: async () => ({ location: { directory: root }, time: {} }) },
      permission: { assert: async (what: any) => void asserted.push(what) },
    } as never,
    DEFAULTS,
  )
  const start = added.find((t) => t.name === "start")
  const context = { sessionID: "ses_1", messageID: "msg_1", id: "prt_1", agent: "build" }
  await start.execute({ command: "echo hi", cwd: "sub" }, context)
  assert.equal(started[0].cwd, path.join(root, "sub"))
  await start.execute({ command: "echo hi", cwd: path.join(root, "sub") }, context)
  assert.equal(started[1].cwd, path.join(root, "sub"))
  await start.execute({ command: "echo hi", cwd: outside }, context)
  assert.equal(started[2].cwd, outside)
  assert.deepEqual(asserted.filter((what) => what.action === "external_directory").map((what) => what.resources), [[outside]])
})

/** The list and stop tools over two sessions: ses_me owns mon_mine, ses_merger (titled "Merger") owns mon_theirs. */
function owned(title: string | null = "Merger") {
  const added: any[] = []
  const stopped: string[] = []
  const monitors = {
    list: () => [
      { id: "mon_mine", name: "mine", session: "ses_me" },
      { id: "mon_theirs", name: "merger land watch", session: "ses_merger" },
    ],
    stop: async (id: string) => (stopped.push(id), { id }),
  }
  registerTools(
    { namespace() {}, add: (t: any) => void added.push(t) } as never,
    monitors as never,
    { session: { get: async ({ sessionID }: any) => (sessionID === "ses_merger" && title !== null ? { title } : {}) } } as never,
    DEFAULTS,
  )
  return { added, stopped }
}

test("list answers only the monitors that wake the calling session", async () => {
  const { added } = owned()
  const list = added.find((t) => t.name === "list")
  assert.deepEqual((await list.execute({}, { sessionID: "ses_me" })).output.monitors.map((monitor: any) => monitor.id), ["mon_mine"])
  assert.deepEqual((await list.execute({}, { sessionID: "ses_merger" })).output.monitors.map((monitor: any) => monitor.id), ["mon_theirs"])
  assert.deepEqual((await list.execute({}, { sessionID: "ses_stranger" })).output.monitors, [])
})

test("stop refuses another session's monitor, naming its session, and stops one of your own", async () => {
  const { added, stopped } = owned()
  const stop = added.find((t) => t.name === "stop")
  await assert.rejects(stop.execute({ id: "mon_theirs" }, { sessionID: "ses_me" }), {
    message: "mon_theirs belongs to session 'Merger'; only that session can stop it",
  })
  assert.deepEqual(stopped, [])
  const result = await stop.execute({ id: "mon_mine" }, { sessionID: "ses_me" })
  assert.deepEqual(result.output.stopped, { id: "mon_mine" })
  assert.deepEqual(stopped, ["mon_mine"])
})

test("stop names the session id when the title is unknown, and keeps the unknown-id error", async () => {
  const stop = owned(null).added.find((t) => t.name === "stop")
  await assert.rejects(stop.execute({ id: "mon_theirs" }, { sessionID: "ses_me" }), {
    message: "mon_theirs belongs to session ses_merger; only that session can stop it",
  })
  await assert.rejects(stop.execute({ id: "mon_none" }, { sessionID: "ses_me" }), { message: "No running monitor with id mon_none" })
})

test("list and stop say the monitors are this session's", () => {
  const { added } = owned()
  assert.match(added.find((t) => t.name === "list").description, /this session's background monitors/)
  assert.match(added.find((t) => t.name === "stop").description, /this session's background monitor/)
})
