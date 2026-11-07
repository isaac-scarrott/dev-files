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
