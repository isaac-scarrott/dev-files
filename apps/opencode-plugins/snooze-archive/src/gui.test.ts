import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import plugin from "./gui"
import type { Snooze } from "./snooze"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

function fixture(initial: Snooze[] = []) {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside><div data-slot="vertical-tabs"><div data-tab-key="tab"><span data-slot="tab-title">Host title</span></div></div></aside>`
  const globals = { window, document: doc, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  const [servers, setServers] = createSignal<string[]>([])
  const [state, setState] = createSignal({ entries: initial })
  const [connected, setConnected] = createSignal(true)
  const listeners = new Map<string, Set<(e: any) => void>>()
  const commands = new Map<string, { run(): Promise<void> | void }>()
  const calls = { closed: [] as string[], opened: [] as unknown[], updates: [] as unknown[], toasts: [] as any[], list: 0 }
  let permissions: unknown[] = []
  let archiveError = false
  let select = ""
  let archived = false
  const info = () => ({ id: "s", title: "Session", time: { updated: 1, ...(archived ? { archived: 1 } : {}) }, location: { directory: "/repo" } })
  const server = {
    id: "server", name: "Local", compatible: true, get connected() { return connected() },
    client: { session: {
      list: async () => { calls.list++; if (archiveError) throw new Error("offline"); return { data: archived ? [info()] : [], cursor: {} } },
      get: async () => info(),
      update: async (input: { archived: boolean }) => { calls.updates.push(input); if (archiveError) throw new Error("denied"); archived = input.archived },
    } },
    data: {
      on: (name: string, fn: (e: any) => void) => {
        const handlers = listeners.get(name) ?? new Set()
        handlers.add(fn); listeners.set(name, handlers)
        return () => { handlers.delete(fn) }
      },
      session: {
        get: () => info(), sync: async () => {}, family: () => [], root: (id: string) => id,
        permission: { sync: async () => {}, list: () => permissions },
        form: { sync: async () => {}, list: () => [] },
      },
    },
  }
  const session = { id: "s", server, pending: false }
  const [tabs, setTabs] = createSignal([{ key: "tab", session }])
  const ctx = {
    signal: new AbortController().signal,
    stores: { snoozes: { get value() { return state() }, update: (fn: (draft: { entries: Snooze[] }) => void) => {
      const draft = structuredClone(state()); fn(draft); setState(draft)
    } } },
    add: (_: unknown, item: any) => { const value = typeof item === "function" ? item() : item; if (value.id) commands.set(value.id, value) },
    servers: { list: servers, get: (id: string) => servers().includes(id) ? server : undefined },
    sessions: { current: () => session },
    tabs: { list: tabs, close: (key: string) => { calls.closed.push(key); setTabs((list) => list.filter((tab) => tab.key !== key)) }, open: (...args: unknown[]) => calls.opened.push(args) },
    dialogs: { select: async () => select || String(Date.now() + 3_600_000), prompt: async () => "30m" },
    toast: { show: (toast: unknown) => { calls.toasts.push(toast); return { dismiss() {} } } },
  } as unknown as Context
  let cleanup: ReturnType<NonNullable<typeof plugin.setup>>
  let dispose = () => {}
  const start = () => createRoot((stop) => { dispose = stop; cleanup = plugin.setup!(ctx) })
  const stop = () => { dispose(); if (typeof cleanup === "function") cleanup() }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  return {
    calls, commands, listeners, doc, state, start, stop, flush, setServers, setConnected,
    permissions: (value: unknown[]) => { permissions = value },
    fail: (value: boolean) => { archiveError = value },
    select: (value: string) => { select = value },
    reopen: () => setTabs([{ key: "tab", session }]),
    emit: (name: string, sessionID = "s") => listeners.get(name)?.forEach((fn) => fn({ created: Date.now() + 1, data: { sessionID } })),
    async close() {
      stop(); await window.happyDOM.close()
      for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
    },
  }
}

test("setup cold-starts, hydrates server inventory, tears down and reloads without duplicates", async () => {
  const f = fixture()
  try {
    f.start(); await f.flush()
    assert.match(f.doc.body.textContent, /Archived—/)
    f.setServers(["server"]); await f.flush()
    assert.match(f.doc.body.textContent, /Archived0/)
    assert.equal(f.calls.list, 1)
    assert.ok([...f.listeners.values()].every((handlers) => handlers.size === 1))
    f.stop()
    assert.ok([...f.listeners.values()].every((handlers) => handlers.size === 0))
    assert.equal(f.doc.querySelector("[data-snooze-archive]"), null)
    f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll("[data-snooze-archive]").length, 1)
    assert.equal(f.doc.querySelector('[data-slot="tab-title"]')?.textContent, "Host title")
  } finally { await f.close() }
})

test("snooze persists server+session, closes only tab, offers undo, and rejects waiting input", async () => {
  const f = fixture()
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.permissions([{}]); await f.commands.get("snooze")!.run()
    assert.equal(f.state().entries.length, 0)
    assert.match(f.calls.toasts.at(-1).description, /waiting/)
    f.permissions([]); await f.commands.get("snooze")!.run(); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.state().entries[0].server, "server")
    assert.deepEqual(f.calls.closed, ["tab"])
    assert.equal(f.calls.updates.length, 0, "snooze must not change native archive or stop work")
    f.calls.toasts.at(-1).actions[0].run(); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
  } finally { await f.close() }
})

test("new events wake only matching snoozed server/session; archived events do not reopen", async () => {
  const now = Date.now()
  const f = fixture([{ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 }])
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.emit("session.execution.succeeded", "other"); assert.equal(f.state().entries.length, 1)
    f.emit("session.execution.succeeded"); assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
    await f.commands.get("snooze")!.run()
    f.emit("session.archived"); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
  } finally { await f.close() }
})

test("archive failure keeps tabs; confirmed archive count and restore use native API", async () => {
  const f = fixture()
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.fail(true); await f.commands.get("archive")!.run()
    assert.equal(f.calls.closed.length, 0)
    assert.match(f.calls.toasts.at(-1).description, /denied/)
    f.fail(false); await f.commands.get("archive")!.run(); await f.flush()
    assert.match(f.doc.body.textContent, /Archived1/)
    const restore = f.doc.querySelector<HTMLButtonElement>('button[aria-label="Restore Session"]')!
    restore.click(); await f.flush()
    assert.deepEqual(f.calls.updates.at(-1), { sessionID: "s", archived: false })
    assert.match(f.doc.body.textContent, /Archived0/)
    assert.equal(f.calls.opened.length, 1)
    f.setConnected(false); await f.flush()
    assert.match(f.doc.body.textContent, /Archived—/)
    f.setConnected(true); await f.flush()
    assert.match(f.doc.body.textContent, /Archived0/)
  } finally { await f.close() }
})

test("persisted snooze closes hydrated tab and manual reopening wakes it", async () => {
  const now = Date.now()
  const f = fixture([{ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 }])
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    assert.deepEqual(f.calls.closed, ["tab"])
    assert.equal(f.state().entries.length, 1)
    f.reopen(); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
  } finally { await f.close() }
})

test("expired snooze is retained offline, wakes on reconnect; archive failures never display zero", async () => {
  const now = Date.now()
  const f = fixture([{ server: "server", id: "s", title: "Session", at: now - 2_000, until: now - 1_000, busy: 0, updated: 1 }])
  try {
    f.setConnected(false); f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.calls.opened.length, 0)
    f.fail(true); f.setConnected(true); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
    assert.match(f.doc.body.textContent, /Archived—/)
    assert.match(f.doc.body.textContent, /offline/)
  } finally { await f.close() }
})
