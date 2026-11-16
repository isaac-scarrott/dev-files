import assert from "node:assert/strict"
import { test } from "node:test"
import { fake } from "../../test-utils/fake.js"
import type { Tokens } from "./measure.js"
import { parseOptions } from "./options.js"
import { type Host, Watcher } from "./watcher.js"

const tokens = (total: number, write = 0): Tokens => ({ input: total - write, cache: { read: 0, write } })

interface Call {
  input: any
}

function boot(directory: string, sessions: Map<string, any>, options = parseOptions()) {
  const synthetic: Call[] = []
  const prompts: Call[] = []
  const storage = new Map<string, unknown>()
  const host = fake<Host>({
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, JSON.parse(JSON.stringify(value))),
      remove: async (key: string) => void storage.delete(key),
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const session = sessions.get(sessionID)
        if (!session) throw new Error("missing")
        return session
      },
      synthetic: async (input: any) => (synthetic.push({ input }), { id: "n" }),
      prompt: async (input: any) => (prompts.push({ input }), { id: "p" }),
    },
  })
  let now = 1_000_000
  const watcher = new Watcher(host, options, { now: () => now }, directory)
  const told: any[] = []
  const changed: string[] = []
  watcher.tell = (notification) => told.push(notification)
  watcher.changed = (id) => changed.push(id)
  return { watcher, synthetic, prompts, storage, told, changed, advance: (ms: number) => void (now += ms), now: () => now }
}

const session = (id: string, extra: Record<string, any> = {}) => ({
  id,
  parentID: undefined,
  location: { directory: "/work" },
  model: { id: "opus", providerID: "claude-agent" },
  time: { created: 1, busy: 2, idle: 3 },
  ...extra,
})

test("an opus root in this location warns once per tier; subagents, other models and other locations are ignored", async () => {
  const sessions = new Map<string, any>()
  sessions.set("s", session("s"))
  sessions.set("child", session("child", { parentID: "s" }))
  sessions.set("sonnet", session("sonnet", { model: { id: "sonnet", providerID: "claude-agent" } }))
  sessions.set("away", session("away", { location: { directory: "/elsewhere" } }))
  const w = boot("/work", sessions)

  for (const id of ["child", "sonnet", "away"]) await w.watcher.onStep(id, tokens(750_000))
  assert.equal(w.synthetic.length, 0)
  assert.equal(w.told.length, 0)

  await w.watcher.onStep("s", tokens(210_000))
  assert.equal(w.synthetic.length, 1)
  assert.match(w.synthetic[0]!.input.text, /^<handoff-nudge>/)
  assert.match(w.synthetic[0]!.input.text, /context is 210k tokens/)
  assert.equal(w.synthetic[0]!.input.delivery, "queue")
  assert.equal(w.synthetic[0]!.input.resume, false)
  assert.equal(w.told.length, 1)
  assert.equal(w.told[0].title, "Context is 210k")

  // Following turns at the same size say nothing; the next tier does.
  await w.watcher.onTurnEnd("s")
  await w.watcher.onStep("s", tokens(230_000))
  assert.equal(w.synthetic.length, 1)
  await w.watcher.onStep("s", tokens(410_000))
  assert.equal(w.synthetic.length, 2)
  assert.match(w.synthetic[1]!.input.text, /context is 410k tokens/)
  await w.watcher.onStep("s", tokens(710_000))
  assert.equal(w.synthetic.length, 3)

  // A compaction below half of every tier re-arms them; the same size fires again.
  await w.watcher.onStep("s", tokens(90_000))
  await w.watcher.onStep("s", tokens(210_000))
  assert.equal(w.synthetic.length, 4)
  assert.deepEqual(w.changed.slice(-1), ["s"])
})

test("a cold wake is the first step of a turn after more than an hour, and warns once per 24 hours", async () => {
  const sessions = new Map<string, any>()
  sessions.set("s", session("s"))
  const w = boot("/work", sessions)
  await w.watcher.onStep("s", tokens(26_000, 5_000))
  assert.equal(w.synthetic.length, 0)
  await w.watcher.onTurnEnd("s")

  w.advance(61 * 60_000)
  await w.watcher.onStep("s", tokens(191_000, 160_000))
  assert.equal(w.synthetic.length, 1)
  assert.match(w.synthetic[0]!.input.text, /woke after more than an hour idle/)
  assert.match(w.synthetic[0]!.input.text, /wrote 160k tokens to the cache/)
  assert.match(w.synthetic[0]!.input.text, /now 191k tokens/)

  // A second cold wake within the day updates the recorded write but does not warn again.
  await w.watcher.onTurnEnd("s")
  w.advance(61 * 60_000)
  await w.watcher.onStep("s", tokens(192_000, 161_000))
  assert.equal(w.synthetic.length, 1)
  assert.equal((await w.watcher.read("s"))?.coldWrite, 161_000)

  // A step in the middle of a turn is not a wake, however long the tool call took.
  await w.watcher.onStep("s", tokens(192_000, 161_000))
  w.advance(61 * 60_000)
  await w.watcher.onStep("s", tokens(192_000, 161_000))
  assert.equal(w.synthetic.length, 1)

  // After 24 hours the cold warning is due again.
  await w.watcher.onTurnEnd("s")
  w.advance(25 * 3_600_000)
  await w.watcher.onStep("s", tokens(193_000, 162_000))
  assert.equal(w.synthetic.length, 2)
})

test("a cold wake that wrote little says nothing", async () => {
  const sessions = new Map<string, any>()
  sessions.set("s", session("s"))
  const w = boot("/work", sessions)
  await w.watcher.onStep("s", tokens(30_000, 5_000))
  await w.watcher.onTurnEnd("s")
  w.advance(61 * 60_000)
  await w.watcher.onStep("s", tokens(131_000, 100_000))
  assert.equal(w.synthetic.length, 0)
  assert.equal((await w.watcher.read("s"))?.coldWrite, 100_000)
})

test("handing off queues the instruction as a user prompt and hides the pill until the next tier", async () => {
  const sessions = new Map<string, any>()
  sessions.set("s", session("s"))
  const w = boot("/work", sessions)
  await w.watcher.onStep("s", tokens(412_000))
  assert.equal((await w.watcher.read("s"))?.tier, 400_000)

  assert.equal(await w.watcher.handoff("s"), true)
  assert.equal(w.prompts.length, 1)
  const text = w.prompts[0]!.input.text as string
  assert.equal(w.prompts[0]!.input.delivery, "queue")
  assert.match(text, /context is 412k tokens/)
  assert.match(text, /STATE\.md/)
  assert.match(text, /HANDOFF-<date>\.md/)
  assert.match(text, /not \$TMPDIR/)
  assert.match(text, /orchestrate create \(create_session, mode "independent"\)/)
  assert.match(text, /read STATE\.md and then the handoff/)
  assert.match(text, /merger and peers the successor's session id/)
  assert.match(text, /Advice only; continue if mid-task\./)
  assert.equal((await w.watcher.read("s"))?.dismissed, 400_000)

  // Already dismissed at this tier: a second dismissal is a no-op, and no new prompt goes out.
  assert.equal(await w.watcher.dismiss("s"), false)
  assert.equal(w.prompts.length, 1)
})

test("a subagent is never queued a handoff", async () => {
  const sessions = new Map<string, any>()
  sessions.set("child", session("child", { parentID: "s" }))
  const w = boot("/work", sessions)
  assert.equal(await w.watcher.handoff("child"), false)
  assert.equal(w.prompts.length, 0)
})

test("dismiss keeps the pill quiet until a higher tier fires", async () => {
  const sessions = new Map<string, any>()
  sessions.set("s", session("s"))
  const w = boot("/work", sessions)
  await w.watcher.onStep("s", tokens(210_000))
  assert.equal(await w.watcher.dismiss("s"), true)
  assert.equal((await w.watcher.read("s"))?.dismissed, 200_000)
  await w.watcher.onStep("s", tokens(410_000))
  assert.equal((await w.watcher.read("s"))?.dismissed, 200_000)
  assert.equal((await w.watcher.read("s"))?.tier, 400_000)
})
