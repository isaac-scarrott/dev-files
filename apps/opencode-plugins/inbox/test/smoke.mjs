// Loads the built server entry against fakes for ctx.rpc, ctx.tool, ctx.session and a throwaway XDG_DATA_HOME, then the
// built GUI bundle under a fake host (see ../../test-utils/gui-smoke.mjs). Build first.

import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { smokeGui } from "../../test-utils/gui-smoke.mjs"

const data = mkdtempSync(join(tmpdir(), "inbox-smoke-"))
process.env.XDG_DATA_HOME = data

const editor = (tools) => ({ add: (tool) => void (tools[tool.name] = tool), get: () => undefined, update: () => {}, remove: () => {}, namespace: () => {}, list: () => [] })

async function boot() {
  const plugin = (await import("../dist/server.js")).default
  assert.equal(plugin.id, "inbox")
  const tools = {}
  const synthetics = []
  const emitted = []
  let handlers
  const ctx = {
    options: {},
    tool: { transform: async (callback) => (callback(editor(tools)), { dispose: async () => undefined }) },
    rpc: {
      register: async (_definition, methods) => {
        handlers = methods
        return { events: { emit: async (name, payload) => void emitted.push({ name, payload }) } }
      },
    },
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, title: "Fix the parser", parentID: undefined, time: { created: 0, updated: 0 } }),
      synthetic: async (input) => void synthetics.push(input),
    },
  }
  const cleanup = await plugin.setup(ctx)
  return { tools, synthetics, emitted, handlers: () => handlers, cleanup }
}

const call = (tools, question, extra = {}) => tools.ask_isaac.execute({ question, ...extra }, { sessionID: "ses_1", messageID: "msg_1", id: "call_1" })

let server = await boot()
assert.ok(server.tools.ask_isaac, "the tool is registered")
assert.match(server.tools.ask_isaac.description, /question, question_background or ask_isaac, never in prose/)
assert.match(server.tools.ask_isaac.description, /Re-asking is merged/)

// Three asks of one question are one item, asked three times, and exactly one notification's worth of list.
const first = await call(server.tools, "Should I merge the branch?")
assert.match(first.content, /Added to Isaac's inbox as #1/)
const second = await call(server.tools, "should i merge the branch")
assert.match(second.content, /Already in Isaac's inbox as #1 \(asked 2 times since \d\d:\d\d\)/)
assert.match(second.content, /Do not ask again in any form; the answer arrives as an <inbox-answer> message\./)
await call(server.tools, "SHOULD I MERGE THE BRANCH?")
let list = await server.handlers().list({})
assert.equal(list.asks.length, 1)
assert.equal(list.asks[0].asks, 3)
assert.equal(list.asks[0].blocking, true)
assert.equal(list.asks[0].session, "ses_1")

// The file is where a reader expects it, atomically written (no temp files left).
const file = join(data, "opencode", "inbox", "asks.json")
const stored = JSON.parse(readFileSync(file, "utf8"))
assert.deepEqual(stored.asks.map((record) => [record.id, record.asks, record.question]), [[1, 3, "Should I merge the branch?"]])

// Answering delivers the <inbox-answer> message into the asking session, once, and the list empties.
assert.deepEqual(await server.handlers().answer({ id: 1, answer: "Yes, squash it." }), { ok: true })
assert.equal(server.synthetics.length, 1)
assert.equal(server.synthetics[0].sessionID, "ses_1")
assert.equal(server.synthetics[0].delivery, "queue")
assert.match(server.synthetics[0].text, /^<inbox-answer>\nYou asked: "Should I merge the branch\?"\nIsaac answered: "Yes, squash it\."\n<\/inbox-answer>$/)
assert.deepEqual(await server.handlers().answer({ id: 1, answer: "again" }), { ok: false })
assert.equal(server.synthetics.length, 1)
assert.deepEqual((await server.handlers().list({})).asks, [])
assert.equal(server.emitted.filter((event) => event.name === "changed").length, 4)

// Re-asking within the day hands the answer straight back; a new question is #2 and can be dismissed.
assert.match((await call(server.tools, "Should I merge the branch?")).content, /^Yes, squash it\.$/)
assert.match((await call(server.tools, "Which theme?")).content, /Added to Isaac's inbox as #2/)
assert.deepEqual(await server.handlers().dismiss({ id: 2 }), { ok: true })
assert.match(server.synthetics[1].text, /Isaac dismissed it without an answer\. Do not ask it again in any form\./)
assert.deepEqual((await server.handlers().list({})).asks, [])
await server.cleanup()

// A ref merges across sessions, and a restart still answers the ask.
assert.match((await call(server.tools, "First wording", { ref: "plan" })).content, /as #3/)
server = await boot()
assert.match((await call(server.tools, "Other wording", { ref: "plan" })).content, /Already in Isaac's inbox as #3 \(asked 2 times/)

const { added } = await smokeGui({
  dir: fileURLToPath(new URL("..", import.meta.url)),
  registries: ["panel", "titlebar-item", "style"],
  host: {
    client: { rpc: () => ({ list: async () => ({ asks: [] }), answer: async () => ({ ok: true }), dismiss: async () => ({ ok: true }), events: { on: () => () => undefined } }) },
  },
  server: "dist/server.js",
})
assert.ok(added.includes("panel") && added.includes("titlebar-item"))
await server.cleanup()
rmSync(data, { recursive: true, force: true })

console.log(`ok  inbox server (merge ×3, file, answer, re-ask answer, dismiss, ref across restart) and gui (${added.join(", ")})`)
