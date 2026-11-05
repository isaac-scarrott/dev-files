// Loads the built server entry the way the host does, then exercises it against fakes for ctx.rpc, ctx.tool and
// ctx.session.synthetic standing in for the real host, to catch wiring bugs the unit tests on logic.ts can't reach.
import assert from "node:assert/strict"

const fakeRegistration = { dispose: async () => undefined }

function fakeEditor(tools) {
  return {
    get: (id) => (tools[id] ? { id, ...tools[id] } : undefined),
    update: (id, fn) => { if (tools[id]) fn(tools[id]) },
    add: (tool) => { tools[tool.name] = tool },
    remove: (id) => delete tools[id],
    namespace: () => undefined,
    list: () => Object.entries(tools).map(([id, tool]) => ({ id, ...tool })),
  }
}

async function run() {
  const mod = await import("../dist/server.js")
  const plugin = mod.default
  if (plugin?.id !== "question-async" || typeof plugin.setup !== "function") throw new Error("missing plugin export")

  const tools = {}
  const synthetics = []
  let handlers
  let emitted = []
  const ctx = {
    tool: { transform: async (cb) => { cb(fakeEditor(tools)); return fakeRegistration } },
    rpc: {
      register: async (_contract, methods) => {
        handlers = methods
        return { events: { emit: async (name, data) => void emitted.push({ name, data }) } }
      },
    },
    session: { synthetic: async (input) => void synthetics.push(input) },
  }

  await plugin.setup(ctx)

  const tool = tools.question_background
  assert.ok(tool, "question_background tool registered")

  const questions = [{ question: "Dark or light?", header: "Theme", options: [{ label: "Dark", description: "d" }, { label: "Light", description: "l" }] }]

  // Calling the tool returns at once and emits an "asked" event; nothing delivered yet.
  const result = await tool.execute({ questions }, { sessionID: "ses_1" })
  assert.match(result.output, /continue with other work/i)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].name, "asked")
  assert.equal(emitted[0].data.sessionID, "ses_1")
  assert.deepEqual(emitted[0].data.questions, questions)
  const requestID = emitted[0].data.requestID
  assert.ok(requestID, "has a requestID")
  assert.equal(synthetics.length, 0, "nothing delivered until answered")

  // The GUI answers: delivered as a synthetic message naming the question and the answer.
  const answered = await handlers.answer({ requestID, answers: [["Dark"]] })
  assert.deepEqual(answered, { accepted: true })
  assert.equal(synthetics.length, 1)
  assert.equal(synthetics[0].sessionID, "ses_1")
  assert.match(synthetics[0].text, /"Dark or light\?"="Dark"/)

  // Answering again (stale requestID, already consumed) is rejected, not delivered twice.
  const again = await handlers.answer({ requestID, answers: [["Light"]] })
  assert.deepEqual(again, { accepted: false })
  assert.equal(synthetics.length, 1)

  // A second ask, dismissed instead of answered.
  emitted = []
  await tool.execute({ questions }, { sessionID: "ses_2" })
  const requestID2 = emitted[0].data.requestID
  const dismissed = await handlers.dismiss({ requestID: requestID2 })
  assert.deepEqual(dismissed, { accepted: true })
  assert.equal(synthetics.length, 2)
  assert.match(synthetics[1].text, /dismissed without an answer/)

  console.log("ok question-async server (question_background: ask, answer, dismiss, stale requestID)")
}

await run()
