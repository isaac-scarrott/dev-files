import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import plugin from "../src/server.js"
import { resetShared } from "../src/ledger.js"

type Hook = (event: any) => unknown

/** Just enough of the host: storage, hooks, one controllable event stream, session calls and the rpc events. */
function fakeHost(storage = new Map<string, unknown>()) {
  const hooks = new Map<string, Hook>()
  const synthetic: any[] = []
  const emitted: any[] = []
  const queue: any[] = []
  let wake: (() => void) | undefined
  const ctx: any = {
    options: { dir: mkdtempSync(join(tmpdir(), "session-procs-plugin-")), dryRun: false, scanSeconds: 1, idleMinutes: 30, killGraceSeconds: 0, guardKill: false },
    location: { directory: "/work" },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, JSON.parse(JSON.stringify(value))),
      remove: async (key: string) => void storage.delete(key),
      scan: async ({ prefix }: { prefix: string }) => ({ entries: [...storage].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })), next: undefined }),
    },
    tool: { hook: async (name: string, run: Hook) => void hooks.set(`tool:${name}`, run) },
    session: {
      get: async () => ({ id: "ses_a", time: { idle: Date.now(), archived: undefined }, parentID: undefined }),
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
    ctx,
    hooks,
    synthetic,
    emitted,
    storage,
    push: (event: unknown) => { queue.push(event); wake?.() },
  }
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (check()) return true
    await settle(25)
  }
  return false
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test("a real shell call is adopted, marked background and reaped when its session is archived", async () => {
  resetShared()
  const host = fakeHost()
  const child = spawn("/bin/bash", ["-c", "sleep 60"], { detached: true, stdio: "ignore" })
  child.unref()
  const pid = child.pid!
  let stop: (() => Promise<void>) | undefined
  try {
    stop = (await plugin.setup(host.ctx)) as () => Promise<void>
    assert.ok(host.hooks.has("tool:execute.before"))
    assert.ok(host.hooks.has("tool:execute.after"))

    // The 2.3.0 background result arrives before shell.created; the mark must wait for the adoption.
    await host.hooks.get("tool:execute.after")!({ tool: "shell", sessionID: "ses_a", status: "completed", input: { command: "sleep 60", background: true }, result: { output: { output: "Command moved to the background", shellID: "sh_1", pid } } })
    host.push({
      type: "shell.created",
      data: { info: { id: "sh_1", status: "running", command: "sleep 60", cwd: "/work", shell: "/bin/bash", pid, metadata: { sessionID: "ses_a" }, time: { started: Date.now() } } },
    })
    assert.ok(await waitFor(() => host.storage.has(`ledger/${pid}`), 4000), "the ledger entry exists")
    const group = host.storage.get(`ledger/${pid}`) as any
    assert.equal(group.sessionID, "ses_a")
    assert.equal(group.shellID, "sh_1")
    assert.equal(group.background, true)

    host.push({ type: "session.archived", data: { sessionID: "ses_a" } })
    assert.ok(await waitFor(() => !alive(pid) && !host.storage.has(`ledger/${pid}`), 5000), "archiving the session ends the process and forgets it")
    assert.ok(host.synthetic.some((message) => String(message.text).startsWith("Ended 1 process of this session (the session was archived)")), JSON.stringify(host.synthetic))
    assert.ok(host.emitted.some((event) => event.name === "notify"))
  } finally {
    try {
      process.kill(-pid, "SIGKILL")
    } catch {}
    await stop?.()
  }
})

test("a foreground shell that already exited is not adopted, and a dry run logs without killing or telling the session", async () => {
  resetShared()
  const host = fakeHost()
  // dryRun on: the plugin may report, but must never signal.
  host.ctx.options = { ...host.ctx.options, dryRun: true }
  const child = spawn("/bin/bash", ["-c", "sleep 60"], { detached: true, stdio: "ignore" })
  child.unref()
  const pid = child.pid!
  let stop: (() => Promise<void>) | undefined
  try {
    stop = (await plugin.setup(host.ctx)) as () => Promise<void>
    host.push({ type: "shell.created", data: { info: { id: "sh_1", status: "running", command: "sleep 60", cwd: "/work", shell: "/bin/bash", pid, metadata: { sessionID: "ses_a" }, time: { started: Date.now() } } } })
    assert.ok(await waitFor(() => host.storage.has(`ledger/${pid}`), 4000))
    host.push({ type: "session.archived", data: { sessionID: "ses_a" } })
    const logFile = join(String(host.ctx.options.dir), "log.jsonl")
    const wouldReap = () => (existsSync(logFile) ? readFileSync(logFile, "utf8") : "").split("\n").some((line) => line.includes('"dryRun":true') && line.includes("the session was archived"))
    assert.ok(await waitFor(wouldReap, 4000), "a dry run logs what it would end")
    await settle(150)
    assert.equal(host.synthetic.length, 0, "a dry run tells no session")
    assert.equal(alive(pid), true, "nothing is killed in a dry run")
    assert.equal(host.storage.has(`ledger/${pid}`), true, "the group stays: it is still running")
  } finally {
    try {
      process.kill(-pid, "SIGKILL")
    } catch {}
    await stop?.()
  }
})

test("the host's month-2.3.0 timestamps are Effect DateTimes, and its background result has a shellID in output", async () => {
  const { timestampMs, backgroundShellID } = await import("../src/server.js")
  assert.equal(timestampMs({ epochMilliseconds: 1_700_000_000_123 }), 1_700_000_000_123)
  assert.equal(timestampMs(1_700_000_000_123), 1_700_000_000_123)
  assert.equal(timestampMs(new Date(1_700_000_000_123)), 1_700_000_000_123)
  assert.equal(timestampMs(undefined), undefined)
  assert.equal(backgroundShellID({ output: { shellID: "sh_1", pid: 10 } }), "sh_1")
  assert.equal(backgroundShellID({ metadata: { status: "running", shellID: "sh_2" } }), "sh_2")
  assert.equal(backgroundShellID({ metadata: { status: "completed" } }), undefined)
})
