// Loads the built server entry the way the host does, then exercises it against a fake ToolEditor + session.synthetic
// standing in for the real host, to catch wiring bugs server.ts's own logic can't be unit-tested for (field names,
// the actual transform/update call sequence).
import assert from "node:assert/strict"

const QUESTION_TOOL = {
  name: "question",
  description: "Asks the user questions",
  input: { type: "object", properties: { questions: { type: "array" } } },
  execute: async (input) => ({ output: `answered: ${JSON.stringify(input)}` }),
}

const fakeRegistration = { dispose: async () => undefined }

function fakeEditor(tools) {
  return {
    get: (id) => (tools[id] ? { id, ...tools[id] } : undefined),
    update: (id, fn) => {
      if (!tools[id]) return
      fn(tools[id])
    },
    add: () => undefined,
    remove: () => undefined,
    namespace: () => undefined,
    list: () => Object.entries(tools).map(([id, tool]) => ({ id, ...tool })),
  }
}

async function run() {
  const mod = await import("../dist/server.js")
  const plugin = mod.default
  if (plugin?.id !== "question-async" || typeof plugin.setup !== "function") throw new Error("missing plugin export")

  const tools = { question: { ...QUESTION_TOOL } }
  const synthetics = []
  const logs = []
  const ctx = {
    tool: { transform: async (cb) => { cb(fakeEditor(tools)); return fakeRegistration } },
    session: { synthetic: async (input) => void synthetics.push(input) },
  }
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { logs.push(String(chunk)); return true }
  try {
    await plugin.setup(ctx)
  } finally {
    process.stderr.write = originalWrite
  }

  assert.ok(logs.some((line) => line.includes("override active")), `expected an active log line, got: ${logs.join("")}`)
  assert.equal(tools.question.input.properties.blocking.type, "boolean")

  const blocking = await tools.question.execute({ questions: [{ question: "Q?" }] }, { sessionID: "ses_smoke" })
  assert.equal(blocking.output, 'answered: {"questions":[{"question":"Q?"}]}')

  const nonBlocking = await tools.question.execute({ questions: [{ question: "Q?" }], blocking: false }, { sessionID: "ses_smoke" })
  assert.match(nonBlocking.output, /continue with other work/i)
  await new Promise((r) => setImmediate(r))
  assert.equal(synthetics.length, 1)
  assert.equal(synthetics[0].sessionID, "ses_smoke")
  assert.match(synthetics[0].text, /answered your non-blocking question/)

  console.log("ok question-async server (active override, blocking + non-blocking paths)")
}

async function runMissingTool() {
  const mod = await import("../dist/server.js")
  const plugin = mod.default
  const tools = {} // no "question" tool at all
  const logs = []
  const ctx = {
    tool: { transform: async (cb) => { cb(fakeEditor(tools)); return fakeRegistration } },
    session: { synthetic: async () => { throw new Error("must not be called") } },
  }
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { logs.push(String(chunk)); return true }
  try {
    await plugin.setup(ctx)
  } finally {
    process.stderr.write = originalWrite
  }
  assert.ok(logs.some((line) => line.includes("override inactive") && line.includes("was not found")), `expected an inactive log line, got: ${logs.join("")}`)
  console.log("ok question-async server (missing tool degrades, never throws)")
}

async function runUnrecognizedSchema() {
  const mod = await import("../dist/server.js")
  const plugin = mod.default
  // Stands in for a Zod-like (or otherwise non-JSON-Schema) input: no `type`/`properties`.
  const tools = { question: { ...QUESTION_TOOL, input: { _def: {}, extend: () => undefined } } }
  const originalInput = tools.question.input
  const originalExecute = tools.question.execute
  const logs = []
  const ctx = {
    tool: { transform: async (cb) => { cb(fakeEditor(tools)); return fakeRegistration } },
    session: { synthetic: async () => { throw new Error("must not be called") } },
  }
  const originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = (chunk) => { logs.push(String(chunk)); return true }
  try {
    await plugin.setup(ctx)
  } finally {
    process.stderr.write = originalWrite
  }
  assert.ok(logs.some((line) => line.includes("override inactive") && line.includes("isn't a plain JSON object schema")), `expected an inactive log line, got: ${logs.join("")}`)
  assert.equal(tools.question.input, originalInput, "schema left untouched")
  assert.equal(tools.question.execute, originalExecute, "execute left untouched")
  console.log("ok question-async server (unrecognized schema degrades, native tool untouched)")
}

await run()
await runMissingTool()
await runUnrecognizedSchema()
