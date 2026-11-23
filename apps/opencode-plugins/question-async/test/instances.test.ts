import assert from "node:assert/strict"
import { test } from "node:test"
import { resetShared } from "../src/registry.js"
import plugin from "../src/server.js"

type Hook = Record<string, any>

/**
 * One fake host: its own event stream and session calls, and storage shared with every other instance of the process,
 * the way the service loads one plugin instance per project directory.
 */
function fakeHost(storage = new Map<string, unknown>()) {
  const tools: Hook = {}
  const synthetic: any[] = []
  const emitted: any[] = []
  const queue: any[] = []
  let seen = 0
  let wake: (() => void) | undefined
  let handlers: Hook | undefined
  const ctx: any = {
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, JSON.parse(JSON.stringify(value))),
    },
    tool: { transform: async (edit: (editor: Hook) => void) => void edit({ add: (tool: Hook) => void (tools[tool.name] = tool) }) },
    rpc: {
      register: async (_contract: unknown, methods: Hook) => {
        handlers = methods
        return { events: { emit: async (name: string, payload: unknown) => void emitted.push({ name, payload }) }, dispose: async () => undefined }
      },
    },
    event: {
      subscribe: ({ signal }: { signal: AbortSignal }) => ({
        async *[Symbol.asyncIterator]() {
          while (!signal.aborted) {
            if (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener("abort", () => resolve(), { once: true }) })
            while (queue.length) {
              seen += 1
              yield queue.shift()
            }
          }
        },
      }),
    },
    session: { synthetic: async (input: unknown) => void synthetic.push(input) },
  }
  return {
    ctx,
    tools,
    synthetic,
    emitted,
    handlers: () => handlers!,
    seen: () => seen,
    push: (event: unknown) => {
      queue.push(event)
      wake?.()
    },
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return
    await tick()
  }
  assert.fail(`timed out waiting for ${label}`)
}

const questions = [
  { question: "Dark or light?", header: "Theme", options: [{ label: "Dark", description: "d" }, { label: "Light", description: "l" }] },
  { question: "Extras?", header: "X", multiple: true, options: [{ label: "A", description: "a" }] },
]
const created = (requestID: string, id: string) => ({ type: "form.created", data: { form: { id, sessionID: "s", metadata: { kind: "question", requestID } } } })
const cancelled = (id: string) => ({ type: "form.cancelled", data: { id, sessionID: "ses_1" } })
const replied = (id: string, answer: Record<string, unknown>) => ({ type: "form.replied", data: { id, sessionID: "ses_1", answer } })

test("two instances deliver one dismissal and one answer exactly once, and a replay delivers nothing", async () => {
  resetShared()
  const storage = new Map<string, unknown>()
  const a = fakeHost(storage)
  const b = fakeHost(storage)
  const stops: (() => void)[] = []
  try {
    stops.push((await plugin.setup(a.ctx)) as () => void, (await plugin.setup(b.ctx)) as () => void)

    // The tool call on one instance is visible to the other: one registry, not a copy per instance.
    const ask = async () => {
      await a.tools.question_background.execute({ questions }, { sessionID: "ses_1", messageID: "msg_1", id: "call_1" })
      return a.emitted.at(-1)!.payload.requestID as string
    }
    const first = await ask()
    assert.deepEqual((await b.handlers().pending({})).requests.map((r: any) => r.requestID), [first])
    assert.deepEqual(await b.handlers().claim({ requestID: first }), { accepted: true })

    // Both instances hear the form being created and then dismissed; only one message may arrive.
    a.push(created(first, "frm_1"))
    b.push(created(first, "frm_1"))
    await waitFor(() => a.seen() >= 1 && b.seen() >= 1, "the form creation on both instances")

    a.push(cancelled("frm_1"))
    b.push(cancelled("frm_1"))
    await waitFor(() => a.seen() >= 2 && b.seen() >= 2, "the dismissal on both instances")
    assert.equal(a.synthetic.length + b.synthetic.length, 1, "one dismissal, one message")
    assert.match((a.synthetic[0] ?? b.synthetic[0]).text, /dismissed without an answer/)
    assert.deepEqual(storage.get("pending"), [], "storage no longer holds the delivered request")

    // A replay of the same event, as after a restart, finds nothing left to claim.
    a.push(cancelled("frm_1"))
    b.push(cancelled("frm_1"))
    await waitFor(() => a.seen() >= 3 && b.seen() >= 3, "the replayed dismissal on both instances")
    assert.equal(a.synthetic.length + b.synthetic.length, 1, "a replay delivers nothing")

    // The answer path is the same claim: one reply, one message.
    const second = await ask()
    await a.handlers().claim({ requestID: second })
    a.push(created(second, "frm_2"))
    b.push(created(second, "frm_2"))
    await waitFor(() => a.seen() >= 4 && b.seen() >= 4, "the second form creation on both instances")
    a.push(replied("frm_2", { q0: "Dark", q1: ["A"] }))
    b.push(replied("frm_2", { q0: "Dark", q1: ["A"] }))
    await waitFor(() => a.seen() >= 5 && b.seen() >= 5, "the reply on both instances")
    assert.equal(a.synthetic.length + b.synthetic.length, 2, "one answer, one message")
    assert.match((a.synthetic[1] ?? b.synthetic[1]).text, /"Dark or light\?"="Dark", "Extras\?"="A"/)
    a.push(replied("frm_2", { q0: "Light" }))
    b.push(replied("frm_2", { q0: "Light" }))
    await waitFor(() => a.seen() >= 6 && b.seen() >= 6, "the replayed reply on both instances")
    assert.equal(a.synthetic.length + b.synthetic.length, 2, "a replayed answer delivers nothing")
  } finally {
    for (const stop of stops) stop?.()
  }
})

test("an instance loaded after the request was stored shares the registry instead of seeding its own copy", async () => {
  resetShared()
  const storage = new Map<string, unknown>()
  const a = fakeHost(storage)
  const stops: (() => void)[] = []
  try {
    stops.push((await plugin.setup(a.ctx)) as () => void)
    await a.tools.question_background.execute({ questions }, { sessionID: "ses_1", messageID: "msg_1", id: "call_1" })
    const requestID = a.emitted[0].payload.requestID as string
    await a.handlers().claim({ requestID })
    a.push(created(requestID, "frm_1"))
    await waitFor(() => a.seen() >= 1, "the form creation")
    assert.equal((storage.get("pending") as any[])[0].formID, "frm_1", "the request with its form is stored")

    // The host loads the next project's instance only now: it must join the same pending registry, not read its own.
    const b = fakeHost(storage)
    stops.push((await plugin.setup(b.ctx)) as () => void)

    a.push(cancelled("frm_1"))
    b.push(cancelled("frm_1"))
    await waitFor(() => a.seen() >= 2 && b.seen() >= 1, "the dismissal on both instances")
    assert.equal(a.synthetic.length + b.synthetic.length, 1, "a late instance does not deliver the stored request again")
    assert.match((a.synthetic[0] ?? b.synthetic[0]).text, /dismissed without an answer/)
  } finally {
    for (const stop of stops) stop?.()
  }
})
