// Loads the built server entry the way the host does, against fakes for ctx.rpc, ctx.tool, ctx.event, ctx.storage and
// ctx.session.synthetic, to catch wiring bugs the unit tests on logic.ts can't reach.
import assert from "node:assert/strict"

const fakeRegistration = { dispose: async () => undefined }
const editor = (tools) => ({ add: (tool) => { tools[tool.name] = tool }, get: () => undefined, update: () => {}, remove: () => {}, namespace: () => {}, list: () => [] })

function queue() {
  const items = []
  let wake
  return {
    push: (item) => { items.push(item); wake?.() },
    iterable: { [Symbol.asyncIterator]: () => ({ next: async () => { while (!items.length) await new Promise((r) => (wake = r)); return { value: items.shift(), done: false } }, return: async () => ({ done: true }) }) },
  }
}

async function boot(store) {
  const plugin = (await import("../dist/server.js")).default
  assert.equal(plugin.id, "question-async")
  const tools = {}, synthetics = [], emitted = [], events = queue()
  let handlers
  const ctx = {
    tool: { transform: async (cb) => { cb(editor(tools)); return fakeRegistration } },
    rpc: { register: async (_c, methods) => { handlers = methods; return { events: { emit: async (name, data) => void emitted.push({ name, data }) } } } },
    event: { subscribe: () => events.iterable },
    storage: { get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) },
    session: { synthetic: async (input) => void synthetics.push(input) },
  }
  const cleanup = await plugin.setup(ctx)
  return { tools, synthetics, emitted, events, handlers: () => handlers, cleanup }
}
const tick = () => new Promise((r) => setTimeout(r, 20))
const questions = [{ question: "Dark or light?", header: "Theme", options: [{ label: "Dark", description: "d" }, { label: "Light", description: "l" }] }, { question: "Extras?", header: "X", multiple: true, options: [{ label: "A", description: "a" }] }]
const call = (t, sid) => t.question_background.execute({ questions }, { sessionID: sid, messageID: "msg_1", id: "call_1" })
const created = (requestID, id) => ({ type: "form.created", data: { form: { id, sessionID: "s", metadata: { kind: "question", requestID } } } })

const store = new Map()
let s = await boot(store)
assert.ok(s.tools.question_background, "tool registered")
assert.match(s.tools.question_background.description, /multiple/)

// Returns at once, announces the request with the tool call it belongs to, delivers nothing yet.
const result = await call(s.tools, "ses_1")
assert.match(result.content, /continue with other work/i)
const asked = s.emitted[0].data
assert.equal(s.emitted[0].name, "asked")
assert.deepEqual([asked.sessionID, asked.messageID, asked.callID], ["ses_1", "msg_1", "call_1"])
assert.equal(s.synthetics.length, 0)

// One window claims it; a second is refused so there is a single form. Unclaimed requests are listed for late windows.
assert.deepEqual((await s.handlers().pending({})).requests.map((r) => r.requestID), [asked.requestID])
assert.deepEqual(await s.handlers().claim({ requestID: asked.requestID }), { accepted: true })
assert.deepEqual(await s.handlers().claim({ requestID: asked.requestID }), { accepted: false })
assert.deepEqual((await s.handlers().pending({})).requests, [])

// The host announces the form, then the reply: delivered once, as a queued synthetic message.
s.events.push(created(asked.requestID, "frm_1"))
s.events.push({ type: "form.replied", data: { id: "frm_1", sessionID: "ses_1", answer: { q0: "Dark", q1: ["A"] } } })
s.events.push({ type: "form.replied", data: { id: "frm_1", sessionID: "ses_1", answer: { q0: "Light", q1: [] } } })
await tick()
assert.equal(s.synthetics.length, 1, "no duplicate delivery")
assert.equal(s.synthetics[0].delivery, "queue")
assert.match(s.synthetics[0].text, /"Dark or light\?"="Dark", "Extras\?"="A"/)

// A form this plugin never made is ignored.
s.events.push({ type: "form.cancelled", data: { id: "frm_other", sessionID: "ses_1" } })
await tick()
assert.equal(s.synthetics.length, 1)

// Dismissal; and a window that could not create the form reports it instead of leaving the agent waiting.
await call(s.tools, "ses_2")
s.events.push(created(s.emitted[1].data.requestID, "frm_2"))
s.events.push({ type: "form.cancelled", data: { id: "frm_2", sessionID: "ses_2" } })
await tick()
assert.match(s.synthetics[1].text, /dismissed without an answer/)
await call(s.tools, "ses_3")
assert.deepEqual(await s.handlers().failed({ requestID: s.emitted[2].data.requestID, reason: "no model" }), { accepted: true })
assert.match(s.synthetics[2].text, /could not be shown to the user: no model/)

// A restart keeps requests that already have a form, so their reply still arrives; others wait for a window again.
await call(s.tools, "ses_4")
const kept = s.emitted[3].data.requestID
await s.handlers().claim({ requestID: kept })
s.events.push(created(kept, "frm_4"))
await call(s.tools, "ses_5")
await tick()
await s.cleanup()
s = await boot(store)
assert.deepEqual((await s.handlers().pending({})).requests.map((r) => r.sessionID), ["ses_5"])
s.events.push({ type: "form.replied", data: { id: "frm_4", sessionID: "ses_4", answer: { q0: "Dark" } } })
await tick()
assert.equal(s.synthetics.length, 1)
assert.equal(s.synthetics[0].sessionID, "ses_4")
await s.cleanup()

console.log("ok question-async server (ask, claim, form reply/cancel, failure, no duplicate, restart)")
process.exit(0)
