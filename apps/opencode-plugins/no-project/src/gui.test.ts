import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot } from "solid-js"
import plugin from "./gui"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

function fixture(options: { exists?: boolean; fail?: boolean; current?: boolean } = {}) {
  const calls: string[] = []
  const controller = new AbortController()
  const drafts: unknown[] = []
  const toasts: unknown[] = []
  const commands: { id: string; title: string; slash?: { name: string }; run: () => unknown }[] = []
  const client = {
    location: { get: async () => ({ directory: "/Users/me" }) },
    file: { read: async (input: { path: string }) => { calls.push(`read ${input.path}`); if (!options.exists) throw new Error("missing") } },
    experimental: { file: { write: async (input: { path: string; payload: Uint8Array }) => {
      calls.push(`write ${input.path}`)
      if (options.fail) throw new Error("denied")
    } } },
  }
  const server = { id: "sidecar", builtin: true, client }
  const ctx = {
    options: {},
    signal: controller.signal,
    t: (key: string) => key,
    sessions: { current: () => options.current ? { server: { ...server, id: "other" } } : undefined },
    servers: { list: () => ["sidecar"], get: () => server },
    layout: { draft: (input: unknown) => drafts.push(input) },
    toast: { show: (input: unknown) => toasts.push(input) },
    add: (_: unknown, item: (typeof commands)[number]) => { commands.push(item) },
  } as unknown as Context
  createRoot(() => { plugin.setup!(ctx) })
  return { commands, calls, drafts, toasts, abort: () => controller.abort() }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test("registers one palette and slash command", () => {
  const { commands } = fixture()
  assert.deepEqual(commands.map((item) => [item.id, item.slash?.name]), [["new", "no-project"]])
})

test("creates the folder then opens an empty draft in it on the routed session's server", async () => {
  const { commands, calls, drafts } = fixture({ current: true })
  await commands[0].run()
  await settle()
  assert.deepEqual(calls, ["read /Users/me/Documents/No project/README.md", "write /Users/me/Documents/No project/README.md"])
  assert.deepEqual(drafts, [{ server: "other", directory: "/Users/me/Documents/No project", prompt: "" }])
})

test("an existing folder is not written again; the builtin server is the fallback", async () => {
  const { commands, calls, drafts } = fixture({ exists: true })
  await commands[0].run()
  await settle()
  assert.deepEqual(calls, ["read /Users/me/Documents/No project/README.md"])
  assert.equal((drafts[0] as { server: string }).server, "sidecar")
})

test("a failed write opens no draft and shows an error toast", async () => {
  const { commands, drafts, toasts } = fixture({ fail: true })
  const warn = console.warn
  console.warn = () => {}
  try {
    await commands[0].run()
    await settle()
  } finally {
    console.warn = warn
  }
  assert.equal(drafts.length, 0)
  assert.deepEqual(toasts, [{ title: "failed", variant: "error" }])
})

test("a failure after the plugin went away shows no toast", async () => {
  const { commands, toasts, abort } = fixture({ fail: true })
  abort()
  const warn = console.warn
  console.warn = () => {}
  try {
    await commands[0].run()
    await settle()
  } finally {
    console.warn = warn
  }
  assert.equal(toasts.length, 0)
})
