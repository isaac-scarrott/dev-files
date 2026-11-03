import assert from "node:assert/strict"
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
  assert.match(start.description, /Good: `Deploy #8216 succeeded in 4m`/)
  assert.match(start.input.properties.name.description, /Human label/)
  assert.match(start.input.properties.command.description, /not raw ids/)
})
