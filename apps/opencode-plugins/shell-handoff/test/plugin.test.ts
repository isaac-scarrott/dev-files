import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import plugin from "../src/server.js"

type Hook = (event: any) => unknown

/** Just enough of the host: storage, hooks, one controllable event stream, session calls and the rpc event. */
function fakeHost(storage = new Map<string, unknown>()) {
  const hooks = new Map<string, Hook>()
  const synthetic: any[] = []
  const emitted: any[] = []
  const queue: any[] = []
  let wake: (() => void) | undefined
  const ctx: any = {
    options: { dir: mkdtempSync(join(tmpdir(), "sh-plugin-")) },
    location: { directory: "/work" },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, JSON.parse(JSON.stringify(value))),
      remove: async (key: string) => void storage.delete(key),
      scan: async ({ prefix }: { prefix: string }) => ({ entries: [...storage].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })), next: undefined }),
    },
    tool: { hook: async (name: string, run: Hook) => void hooks.set(`tool:${name}`, run) },
    session: {
      hook: async (name: string, run: Hook) => void hooks.set(`session:${name}`, run),
      get: async () => ({ id: "ses_a" }),
      synthetic: async (input: unknown) => void synthetic.push(input),
    },
    rpc: { register: async () => ({ events: { emit: async (name: string, payload: unknown) => void emitted.push({ name, payload }) }, dispose: async () => {} }) },
    event: {
      subscribe: ({ signal }: { signal: AbortSignal }) => ({
        async *[Symbol.asyncIterator]() {
          while (!signal.aborted) {
            if (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener("abort", () => resolve(), { once: true }) })
            while (queue.length) yield queue.shift()
          }
        },
      }),
    },
  }
  return {
    ctx, hooks, synthetic, emitted, storage,
    push: (event: unknown) => { queue.push(event); wake?.() },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test("the events and hooks of one background job, then a hot reload and a restart", async () => {
  const host = fakeHost()
  const stop = (await plugin.setup(host.ctx)) as () => Promise<void>
  host.push({ type: "shell.created", data: { info: { id: "sh_1", command: "sleep 600", cwd: "/work", pid: 1, file: "/f", metadata: { sessionID: "ses_a" }, time: { started: Date.now() - 3000 } } } })
  await settle()
  await host.hooks.get("tool:execute.after")!({ tool: "shell", sessionID: "ses_a", messageID: "m", id: "c", input: { command: "sleep 600", background: true }, status: "completed", result: { metadata: { status: "running", shellID: "sh_1" } } })
  assert.ok(host.storage.has("job/sh_1"))

  // A foreground command and another tool are not recorded.
  host.push({ type: "shell.created", data: { info: { id: "sh_2", command: "ls", cwd: "/work", metadata: {}, time: { started: 1 } } } })
  await host.hooks.get("tool:execute.after")!({ tool: "shell", sessionID: "ses_a", messageID: "m", id: "c2", input: { command: "ls" }, status: "completed", result: { metadata: { status: "completed" } } })
  await host.hooks.get("tool:execute.after")!({ tool: "read", sessionID: "ses_a", messageID: "m", id: "c3", input: {}, status: "completed", result: {} })
  assert.deepEqual([...host.storage.keys()], ["job/sh_1"])

  // Hot reload in the same process: nothing is reported.
  await stop()
  const reloaded = fakeHost(host.storage)
  const stop2 = (await plugin.setup(reloaded.ctx)) as () => Promise<void>
  assert.equal(reloaded.synthetic.length, 0)
  assert.equal(reloaded.emitted.length, 0)
  assert.ok(host.storage.has("job/sh_1"))

  // The job finishes: the record goes.
  reloaded.push({ type: "shell.exited", data: { id: "sh_1", status: "exited", exit: 0 } })
  await settle()
  assert.equal(host.storage.has("job/sh_1"), false)
  await stop2()
})

test("another service process: the stored job is reported through the session and the hub", async () => {
  const storage = new Map<string, unknown>([["job/sh_9", { shellID: "sh_9", sessionID: "ses_a", command: "make watch", cwd: "/work", startedAt: Date.now() - 600_000, boot: "1:1" }]])
  const host = fakeHost(storage)
  const stop = (await plugin.setup(host.ctx)) as () => Promise<void>
  assert.equal(host.synthetic.length, 1)
  assert.equal(host.synthetic[0].sessionID, "ses_a")
  assert.equal(host.synthetic[0].resume, false)
  assert.equal(host.synthetic[0].delivery, "queue")
  assert.match(host.synthetic[0].text, /make watch/)
  assert.equal(host.emitted.length, 1)
  assert.equal(host.emitted[0].name, "notify")
  assert.equal(host.emitted[0].payload.kind, "info")
  assert.deepEqual(host.emitted[0].payload.target, { session: "ses_a" })
  assert.equal(storage.size, 0)
  await stop()
})

test("the idle hook drops what the host no longer lists", async () => {
  const host = fakeHost()
  const stop = (await plugin.setup(host.ctx)) as () => Promise<void>
  await host.hooks.get("tool:execute.after")!({ tool: "shell", sessionID: "ses_a", messageID: "m", id: "c", input: { command: "x" }, status: "completed", result: { metadata: { status: "running", shellID: "sh_5" } } })
  assert.ok(host.storage.has("job/sh_5"))
  host.hooks.get("session:experimental.idle")!({ sessionID: "ses_a", background: [{ kind: "shell", sessionID: "ses_a", shellID: "sh_5", command: "x" }] })
  assert.ok(host.storage.has("job/sh_5"))
  host.hooks.get("session:experimental.idle")!({ sessionID: "ses_a", background: [] })
  await settle()
  assert.equal(host.storage.has("job/sh_5"), false)
  await stop()
})
