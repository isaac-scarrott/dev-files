import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import plugin from "./gui"
import type { Snooze } from "./snooze"
import { fakeUi } from "./testui"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

function fixture(initial: Snooze[] = []) {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside><div data-slot="vertical-tabs"><div data-tab-key="tab"><span data-slot="tab-title">Host title</span></div></div></aside>`
  const globals = { window, document: doc, Node: window.Node, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  const [servers, setServers] = createSignal<string[]>([])
  const [state, setState] = createSignal({ entries: initial })
  const [connected, setConnected] = createSignal(true)
  const listeners = new Map<string, Set<(e: any) => void>>()
  const commands = new Map<string, { run(): Promise<void> | void }>()
  const calls = { closed: [] as string[], opened: [] as unknown[], updates: [] as unknown[], toasts: [] as any[], list: 0, requestSync: 0, metadataReads: 0, removed: [] as unknown[], confirms: [] as any[] }
  let permissions: unknown[] | undefined = []
  let forms: unknown[] | undefined = []
  let family: string[] | undefined = []
  const childRequests = new Map<string, { permissions?: unknown[]; forms?: unknown[] }>()
  let metadata: "ready" | "missing" | "no-time" = "ready"
  let sync = async () => {}
  let archiveError = false
  let select = ""
  let confirmResult = true
  let removeError = false
  const slots: any[] = []
  let archived = false
  const info = () => { calls.metadataReads++; return metadata === "missing" ? undefined : ({ id: "s", title: "Session", time: metadata === "no-time" ? undefined : { updated: 1, ...(archived ? { archived: 1 } : {}) }, location: { directory: "/repo" } }) }
  const server = {
    id: "server", name: "Local", compatible: true, get connected() { return connected() },
    client: { session: {
      list: async () => { calls.list++; if (archiveError) throw new Error("offline"); return { data: archived ? [info()] : [], cursor: {} } },
      get: async () => info(),
      remove: async (input: unknown) => { calls.removed.push(input); if (removeError) throw new Error("server refused") },
      update: async (input: { archived: boolean }) => { calls.updates.push(input); if (archiveError) throw new Error("denied"); archived = input.archived },
    } },
    data: {
      on: (name: string, fn: (e: any) => void) => {
        const handlers = listeners.get(name) ?? new Set()
        handlers.add(fn); listeners.set(name, handlers)
        return () => { handlers.delete(fn) }
      },
      session: {
        get: () => info(), sync: () => sync(), family: () => family, root: (id: string) => id,
        permission: { sync: async () => { calls.requestSync++ }, list: (id: string) => id === "s" ? permissions : childRequests.get(id)?.permissions },
        form: { sync: async () => { calls.requestSync++ }, list: (id: string) => id === "s" ? forms : childRequests.get(id)?.forms },
      },
    },
  }
  const session = { id: "s", server, pending: false }
  const [tabs, setTabs] = createSignal([{ key: "tab", session }])
  const ctx = {
    ui: fakeUi(doc),
    signal: new AbortController().signal,
    stores: { snoozes: { get value() { return state() }, update: (fn: (draft: { entries: Snooze[] }) => void) => {
      const draft = structuredClone(state()); fn(draft); setState(draft)
    } } },
    add: (_: unknown, item: any) => { const value = typeof item === "function" ? item() : item; if (value.at) slots.push(value); else if (value.id) commands.set(value.id, value) },
    servers: { list: servers, get: (id: string) => servers().includes(id) ? server : undefined },
    sessions: { current: () => session },
    tabs: { list: tabs, close: (key: string) => { calls.closed.push(key); setTabs((list) => list.filter((tab) => tab.key !== key)) }, open: (...args: unknown[]) => calls.opened.push(args) },
    dialogs: { confirm: async (options: unknown) => { calls.confirms.push(options); return confirmResult }, select: async () => select || String(Date.now() + 3_600_000), prompt: async () => "30m" },
    toast: { show: (toast: unknown) => { calls.toasts.push(toast); return { dismiss() {} } } },
  } as unknown as Context
  let cleanup: ReturnType<NonNullable<typeof plugin.setup>>
  let dispose = () => {}
  const start = () => createRoot((stop) => { dispose = stop; cleanup = plugin.setup!(ctx) })
  const stop = () => { dispose(); if (typeof cleanup === "function") cleanup() }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  return {
    calls, commands, listeners, doc, state, start, stop, flush, setServers, setConnected,
    permissions: (value: unknown[] | undefined) => { permissions = value },
    forms: (value: unknown[] | undefined) => { forms = value },
    family: (value: string[] | undefined) => { family = value },
    child: (id: string, value: { permissions?: unknown[]; forms?: unknown[] }) => childRequests.set(id, value),
    metadata: (value: typeof metadata) => { metadata = value },
    sync: (value: () => Promise<void>) => { sync = value },
    archived: (value: boolean) => { archived = value },
    slots, confirm: (value: boolean) => { confirmResult = value }, removeError: (value: boolean) => { removeError = value },
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

for (const unloaded of ["parent permissions", "parent forms", "child permissions", "child forms", "metadata", "metadata time", "family"] as const) {
  test(`new snooze rejects unloaded ${unloaded}, then accepts hydrated empty requests`, async () => {
    const f = fixture()
    try {
      f.start(); f.setServers(["server"]); await f.flush()
      if (unloaded === "parent permissions") f.permissions(undefined)
      if (unloaded === "parent forms") f.forms(undefined)
      if (unloaded.startsWith("child")) {
        f.family(["child"])
        f.child("child", unloaded === "child permissions" ? { forms: [] } : { permissions: [] })
      }
      if (unloaded === "metadata") f.metadata("missing")
      if (unloaded === "metadata time") f.metadata("no-time")
      if (unloaded === "family") f.family(undefined)
      await f.commands.get("snooze")!.run(); await f.flush()
      assert.equal(f.state().entries.length, 0)
      assert.equal(f.calls.closed.length, 0)
      assert.match(f.calls.toasts.at(-1).description, /still loading.*Retry snooze/)
      f.permissions([]); f.forms([]); f.family(["child"]); f.child("child", { permissions: [], forms: [] }); f.metadata("ready")
      await f.commands.get("snooze")!.run(); await f.flush()
      assert.equal(f.state().entries.length, 1)
      assert.deepEqual(f.calls.closed, ["tab"])
    } finally { await f.close() }
  })
}

test("startup with unknown parent/descendant requests retains snooze and defers closing until hydration", async () => {
  const now = Date.now()
  const f = fixture([{ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 }])
  try {
    f.permissions(undefined); f.forms(undefined); f.family(["child"]); f.metadata("no-time")
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.calls.closed.length, 0)
    assert.equal(f.calls.toasts.length, 0)
    f.permissions([]); f.forms([]); f.child("child", { permissions: [], forms: [] }); f.metadata("ready")
    f.setConnected(false); f.setConnected(true); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.deepEqual(f.calls.closed, ["tab"])
  } finally { await f.close() }
})

for (const reason of ["deadline", "archive", "known child attention"] as const) {
  test(`reconcile honors ${reason} even with unknown pending-request state`, async () => {
    const now = Date.now()
    const f = fixture([{ server: "server", id: "s", title: "Session", at: now - 2_000, until: reason === "deadline" ? now - 1_000 : now + 60_000, busy: 0, updated: 1 }])
    try {
      f.permissions(undefined); f.forms(undefined); f.family(["child"])
      if (reason === "archive") f.archived(true)
      if (reason === "deadline") f.metadata("missing")
      if (reason === "known child attention") f.child("child", { permissions: [{}] })
      f.sync(async () => { throw new Error("sync unavailable") })
      f.start(); f.setServers(["server"]); await f.flush()
      assert.equal(f.state().entries.length, 0)
      assert.equal(f.calls.opened.length, reason === "archive" ? 0 : 1)
      assert.equal(f.calls.toasts.length, 0)
    } finally { await f.close() }
  })
}

for (const action of ["snooze", "reconcile"] as const) {
  test(`cleanup during ${action} sync prevents subsequent cold metadata/request reads or mutations`, async () => {
    const now = Date.now()
    const f = fixture(action === "reconcile" ? [{ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 }] : [])
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    try {
      f.metadata("missing"); f.permissions(undefined); f.forms(undefined); f.sync(() => gate)
      f.start(); f.setServers(["server"]); await f.flush()
      const pending = action === "snooze" ? f.commands.get("snooze")!.run() : undefined
      await f.flush(); f.stop()
      const reads = f.calls.metadataReads
      release(); await pending; await f.flush()
      assert.equal(f.calls.metadataReads, reads)
      assert.equal(f.calls.requestSync, 0)
      assert.equal(f.calls.closed.length, 0)
      assert.equal(f.calls.opened.length, 0)
      assert.equal(f.calls.toasts.length, 0)
    } finally { release(); await f.close() }
  })
}

test("deadline wake never reopens a session already known to be natively archived", async () => {
  const now = Date.now()
  const f = fixture([{ server: "server", id: "s", title: "Session", at: now - 2_000, until: now - 1_000, busy: 0, updated: 1 }])
  try {
    f.permissions(undefined); f.forms(undefined); f.archived(true); f.setServers(["server"])
    f.start(); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 0)
  } finally { await f.close() }
})

const click = (el: Element | null | undefined) => (el as HTMLElement).click()

test("tab row actions attach once, are siblings of host title, snooze/archive/delete call exact APIs and clean up", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.doc.querySelector('[data-slot="vertical-tabs"]')!.dispatchEvent(new (f.doc.defaultView as any).CustomEvent("x"))
    const host = f.doc.querySelector<HTMLElement>("[data-tab-key]")!
    assert.equal(host.querySelectorAll('[data-sa-actions="tab"]').length, 1)
    assert.equal(host.querySelector('[data-slot="tab-title"]')?.textContent, "Host title")
    const labels = [...host.querySelectorAll("[data-sa-actions] button")].map((b) => b.getAttribute("aria-label"))
    assert.deepEqual(labels, ["Snooze… Session", "Archive Session", "Delete… Session"])
    click(host.querySelector('[data-sa-actions] button[data-icon="archive"]')); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
    f.stop()
    assert.equal(f.doc.querySelectorAll("[data-sa-actions]").length, 0)
    assert.equal(f.doc.querySelector("[data-sa-tab-host]"), null)
    f.archived(false); f.reopen(); f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll('[data-sa-actions="tab"]').length, 1)
    f.stop(); f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll('[data-sa-actions="tab"]').length, 1)
  } finally { await f.close() }
})

test("snooze action opens preset picker for that tab's session", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    click(f.doc.querySelector('[data-sa-actions] button[data-icon="notifications"]')); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.state().entries[0].id, "s")
  } finally { await f.close() }
})

test("delete confirms permanently; cancel does nothing; confirm calls session.remove, closes tab", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.confirm(false)
    click(f.doc.querySelector('[data-sa-actions] button[data-icon="outline-trash"]')); await f.flush()
    assert.equal(f.calls.confirms.length, 1)
    assert.match(f.calls.confirms[0].description, /permanently/)
    assert.equal(f.calls.confirms[0].danger, true)
    assert.deepEqual(f.calls.removed, [])
    assert.deepEqual(f.calls.closed, [])
    f.confirm(true)
    click(f.doc.querySelector('[data-sa-actions] button[data-icon="outline-trash"]')); await f.flush()
    assert.deepEqual(f.calls.removed, [{ sessionID: "s" }])
    assert.deepEqual(f.calls.closed, ["tab"])
  } finally { await f.close() }
})

test("delete failure shows an error and keeps the tab", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.removeError(true)
    click(f.doc.querySelector('[data-sa-actions] button[data-icon="outline-trash"]')); await f.flush()
    assert.deepEqual(f.calls.closed, [])
    assert.equal(f.calls.toasts.at(-1).variant, "error")
    assert.match(f.calls.toasts.at(-1).description, /server refused/)
  } finally { await f.close() }
})

test("archived rows can be deleted from the Archived group; header slot renders the same actions", async () => {
  const f = fixture()
  try {
    f.archived(true); f.setServers(["server"]); f.start(); await f.flush()
    const row = f.doc.querySelector('[data-sa-row] button[data-icon="outline-trash"]')
    assert.ok(row)
    click(row); await f.flush()
    assert.deepEqual(f.calls.removed, [{ sessionID: "s" }])
    const header = f.slots.find((slot) => slot.at === "session.header")
    const el = header.render({ session: { id: "s", server: { id: "server", data: { session: { get: () => ({ title: "T" }) } } }, pending: false } })
    click(el.querySelector('[data-sa-actions] button[data-icon="archive"]')); await f.flush()
    assert.equal(f.calls.updates.length, 1)
  } finally { await f.close() }
})

test("cold SDK state: tab actions tolerate undefined titles and lists", async () => {
  const f = fixture()
  try {
    f.metadata("missing"); f.permissions(undefined); f.forms(undefined); f.family(undefined)
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll('[data-sa-actions="tab"]').length, 1)
  } finally { await f.close() }
})
