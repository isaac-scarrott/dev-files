import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { NAMESPACE, registerTools } from "./tools.js"
import { DEFAULTS } from "./options.js"

test("registers start, list, stop and wait under the monitor namespace", () => {
  const added: any[] = []
  const editor = { namespace: (n: unknown) => void added.push({ namespace: n }), add: (t: any) => void added.push(t) }
  registerTools(editor as never, {} as never, {} as never, DEFAULTS)
  assert.equal(NAMESPACE, "monitor")
  assert.equal(added[0].namespace.name, "monitor")
  const tools = added.slice(1)
  assert.deepEqual(tools.map((t) => t.name), ["start", "list", "stop", "wait"])
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
  assert.match(start.description, /monitor\.wait\(\{id\}\)/)
  assert.match(start.description, /the real work \(the install, the test run\), not `sleep N; check`/)
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

/** The list, stop and wait tools over two sessions: ses_me owns mon_mine, ses_merger (titled "Merger") owns mon_theirs. */
function owned(title: string | null = "Merger") {
  const added: any[] = []
  const stopped: string[] = []
  const waited: { id: string; timeoutMs: number }[] = []
  const monitors = {
    list: () => [
      { id: "mon_mine", name: "mine", session: "ses_me" },
      { id: "mon_theirs", name: "merger land watch", session: "ses_merger" },
    ],
    owner: (id: string) => (id === "mon_mine" ? "ses_me" : id === "mon_theirs" ? "ses_merger" : undefined),
    stop: async (id: string) => (stopped.push(id), { id }),
    wait: async (id: string, timeoutMs: number) => (waited.push({ id, timeoutMs }), { state: "exited", exitCode: 0, lines: ["done"] }),
  }
  registerTools(
    { namespace() {}, add: (t: any) => void added.push(t) } as never,
    monitors as never,
    { session: { get: async ({ sessionID }: any) => (sessionID === "ses_merger" && title !== null ? { title } : {}) } } as never,
    DEFAULTS,
  )
  return { added, stopped, waited }
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

test("wait refuses another session's monitor, naming its session", async () => {
  const { added, waited } = owned()
  const wait = added.find((t) => t.name === "wait")
  await assert.rejects(wait.execute({ id: "mon_theirs" }, { sessionID: "ses_me" }), {
    message: "mon_theirs belongs to session 'Merger'; only that session can wait for it",
  })
  assert.deepEqual(waited, [])
})

test("wait uses 20 minutes by default and the given timeout at most 30", async () => {
  const { added, waited } = owned()
  const wait = added.find((t) => t.name === "wait")
  const result = await wait.execute({ id: "mon_mine" }, { sessionID: "ses_me" })
  assert.deepEqual(result.output, { state: "exited", exitCode: 0, lines: ["done"] })
  await wait.execute({ id: "mon_mine", timeoutMinutes: 30 }, { sessionID: "ses_me" })
  assert.deepEqual(waited, [
    { id: "mon_mine", timeoutMs: 1_200_000 },
    { id: "mon_mine", timeoutMs: 1_800_000 },
  ])
  await assert.rejects(wait.execute({ id: "mon_mine", timeoutMinutes: 31 }, { sessionID: "ses_me" }), { message: "timeoutMinutes must be an integer from 1 to 30" })
  await assert.rejects(wait.execute({ id: "mon_mine", timeoutMinutes: 0 }, { sessionID: "ses_me" }), { message: "timeoutMinutes must be an integer from 1 to 30" })
})

test("wait keeps the unknown-id error and the description names the three outcomes", async () => {
  const { added } = owned()
  const wait = added.find((t) => t.name === "wait")
  await assert.rejects(wait.execute({ id: "mon_none" }, { sessionID: "ses_me" }), { message: "No monitor with id mon_none" })
  assert.match(wait.description, /state exited, with exitCode and its last lines/)
  assert.match(wait.description, /state timeout/)
  assert.match(wait.description, /already ended returns at once/)
  assert.match(wait.description, /restart ends the call/)
})
