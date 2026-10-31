import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import plugin from "./gui"
import type { Snooze } from "./snooze"
import { fakeUi } from "./testui"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

function fixture(initial: Snooze[] = [], initialWoke: { server: string; id: string }[] = []) {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside><div data-slot="vertical-tabs"><div data-tab-key="tab"><span data-slot="tab-title">Host title</span></div></div></aside>`
  const globals = { window, document: doc, Node: window.Node, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  const [servers, setServers] = createSignal<string[]>([])
  const [state, setState] = createSignal({ entries: initial })
  const [wokeState, setWokeState] = createSignal({ entries: initialWoke })
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
  const [current, setCurrent] = createSignal<typeof session | undefined>(session)
  const [tabs, setTabs] = createSignal([{ key: "tab", session }])
  const ctx = {
    ui: fakeUi(doc),
    signal: new AbortController().signal,
    stores: { snoozes: { get value() { return state() }, update: (fn: (draft: { entries: Snooze[] }) => void) => {
      const draft = structuredClone(state()); fn(draft); setState(draft)
    } }, woke: { get value() { return wokeState() }, update: (fn: (draft: { entries: { server: string; id: string }[] }) => void) => {
      const draft = structuredClone(wokeState()); fn(draft); setWokeState(draft)
    } } },
    add: (_: unknown, item: any) => { const value = typeof item === "function" ? item() : item; if (value.at) slots.push(value); else if (value.id) commands.set(value.id, value) },
    servers: { list: servers, get: (id: string) => servers().includes(id) ? server : undefined },
    sessions: { current: () => current() },
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
    calls, commands, listeners, doc, state, woke: wokeState, addWoke: () => setWokeState({ entries: [{ server: "server", id: "s" }] }), setCurrent: (value: boolean) => setCurrent(value ? session : undefined), start, stop, flush, setServers, setConnected,
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
    f.permissions([{}]); await runSnooze(f)
    assert.equal(f.state().entries.length, 0)
    assert.match(f.calls.toasts.at(-1).description, /waiting/)
    f.permissions([]); await runSnooze(f); await f.flush()
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
    await runSnooze(f)
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
      await runSnooze(f); await f.flush()
      assert.equal(f.state().entries.length, 0)
      assert.equal(f.calls.closed.length, 0)
      assert.match(f.calls.toasts.at(-1).description, /still loading.*Retry snooze/)
      f.permissions([]); f.forms([]); f.family(["child"]); f.child("child", { permissions: [], forms: [] }); f.metadata("ready")
      await runSnooze(f); await f.flush()
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
      const pending = action === "snooze" ? runSnooze(f) : undefined
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
// Runs the palette command and chooses the first preset (In 1 hour) in the menu it opens.
async function runSnooze(f: { commands: Map<string, { run(): Promise<void> | void }>; doc: Document }, index = 0) {
  const pending = f.commands.get("snooze")!.run()
  for (let i = 0; i < 40 && !f.doc.querySelector("[data-sa-popup]"); i++) await Promise.resolve()
  click(f.doc.querySelectorAll("[data-sa-popup] [role=menuitem]")[index])
  await new Promise((r) => setTimeout(r, 5))
  await pending
}

const NATIVE_MENU = `<div role="menu" data-component="menu-v2-content" data-appearance="compact"><div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">Rename</span></div><div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">Close tab</span></div><div data-slot="menu-v2-separator"></div><div role="menuitem" tabindex="-1" data-component="menu-v2-item" data-variant="critical"><span data-slot="menu-v2-item-content">Delete session…</span></div></div>`
const key = (el: Element, name: string) => el.dispatchEvent(new (el.ownerDocument.defaultView as any).KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))
const labelsOf = (menu: Element) => [...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)
// The live menu has no aria-labelledby; the contextmenu event on the tab is the only link.
function openNativeMenu(f: { doc: Document }, target: Element = f.doc.querySelector("[data-tab-key] [data-slot='tab-title']")!) {
  target.dispatchEvent(new (f.doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  const portal = f.doc.createElement("div")
  portal.innerHTML = NATIVE_MENU
  f.doc.body.append(portal)
  return portal.firstElementChild as HTMLElement
}

test("tab hover shows only Archive beside the host title and cleans up; the native close control is untouched", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const host = f.doc.querySelector<HTMLElement>("[data-tab-key]")!
    assert.equal(host.querySelectorAll('[data-sa-actions="tab"]').length, 1)
    assert.equal(host.querySelector('[data-slot="tab-title"]')?.textContent, "Host title")
    assert.deepEqual([...host.querySelectorAll("button[data-sa-actions]")].map((b) => b.getAttribute("aria-label")), ["Archive Session"])
    assert.equal(f.doc.querySelector('[data-slot="session.header"], [data-sa-actions="header"]'), null)
    click(host.querySelector('button[data-sa-actions][data-icon="archive"]')); await f.flush()
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

test("the plugin registers no session header slot", async () => {
  const f = fixture()
  try { f.setServers(["server"]); f.start(); await f.flush(); assert.equal(f.slots.some((slot) => slot.at === "session.header"), false) } finally { await f.close() }
})

test("native tab menu gains a Snooze submenu and Archive once, before the native Delete…, keyboard reachable, removed on cleanup", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = openNativeMenu(f); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Close tab", "Snooze", "Archive", "Delete session…"])
    assert.equal(menu.querySelectorAll("[data-sa-menu][role=menuitem]").length, 2)
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    assert.equal(items[2].dataset.component, "menu-v2-item", "uses the app's item markup")
    assert.ok(items[2].querySelector('[data-slot="menu-v2-item-chevron"]'), "submenu trigger shows the host chevron")
    assert.equal(items[2].getAttribute("aria-haspopup"), "true")
    // Kobalte would wrap from Close tab to Delete…; we step onto our items instead.
    items[1].focus(); key(items[1], "ArrowDown")
    assert.equal(f.doc.activeElement, items[2])
    key(items[2], "ArrowDown"); key(items[3], "ArrowDown")
    assert.equal(f.doc.activeElement, items[4], "then onto the native Delete…")
    key(items[4], "ArrowUp"); assert.equal(f.doc.activeElement, items[3])
    assert.ok(items[3].hasAttribute("data-highlighted") && !items[4].hasAttribute("data-highlighted"))
    // Text change inside the portal never duplicates items.
    menu.append(f.doc.createElement("i")); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 2)
    key(items[3], "Enter"); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
    f.stop()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 0)
  } finally { await f.close() }
})

test("Snooze submenu: opens beside its trigger on ArrowRight with live times, Left/Esc close only it, hover over another item closes it, nothing leaks", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = openNativeMenu(f); await f.flush()
    const trigger = [...menu.querySelectorAll<HTMLElement>("[data-sa-menu]")][0]
    const sub = () => menu.querySelector<HTMLElement>("[data-sa-sub]")
    trigger.focus(); key(trigger, "ArrowRight")
    assert.ok(sub(), "inside the native menu element, so the app's outside-click checks keep it open")
    assert.equal(trigger.getAttribute("aria-expanded"), "true")
    assert.equal(sub()!.dataset.component, "menu-v2-content")
    const labels = [...sub()!.querySelectorAll('[role="menuitem"]')].map((i) => i.querySelector('[data-slot="menu-v2-item-content"]')!.textContent)
    assert.deepEqual(labels.slice(0, 2), ["In 1 hour", "In 3 hours"]); assert.equal(labels.at(-1), "Custom…")
    assert.ok([...sub()!.querySelectorAll('[data-slot="menu-v2-item-shortcut"]')].every((h) => /\d/.test(h.textContent!)), "resolved time hints")
    assert.equal(f.doc.activeElement, sub()!.querySelector('[role="menuitem"]'))
    key(f.doc.activeElement!, "ArrowDown"); assert.equal(f.doc.activeElement!.textContent!.startsWith("In 3 hours"), true)
    key(f.doc.activeElement!, "ArrowLeft")
    assert.equal(sub(), null); assert.equal(f.doc.activeElement, trigger); assert.equal(trigger.getAttribute("aria-expanded"), "false")
    key(trigger, "Enter"); assert.ok(sub()); key(f.doc.activeElement!, "Escape"); assert.equal(sub(), null)
    key(trigger, "ArrowRight")
    ;(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')[0] as HTMLElement).dispatchEvent(new (f.doc.defaultView as any).Event("pointerover", { bubbles: true }))
    assert.equal(sub(), null, "moving onto a native item closes it")
    key(trigger, "ArrowRight"); click(sub()!.querySelectorAll('[role="menuitem"]')[1]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(f.state().entries.length, 1, "choosing a preset snoozes without a second menu")
    assert.equal(f.doc.querySelector("[data-sa-popup]"), null)
    assert.ok(Math.abs(f.state().entries[0].until - (Date.now() + 3 * 3_600_000)) < 5_000)
    f.stop()
    assert.equal(menu.querySelectorAll("[data-sa-menu], [data-sa-sub]").length, 0)
  } finally { await f.close() }
})

test("palette Snooze opens the presets under the session's own tab row, not a fixed screen position", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const tab = f.doc.querySelector<HTMLElement>("[data-tab-key]")!
    tab.getBoundingClientRect = () => ({ left: 20, bottom: 230, top: 200, right: 260, width: 240, height: 30, x: 20, y: 200, toJSON() {} }) as DOMRect
    const pending = f.commands.get("snooze")!.run()
    for (let i = 0; i < 40 && !f.doc.querySelector("[data-sa-popup]"); i++) await Promise.resolve()
    const popup = f.doc.querySelector<HTMLElement>("[data-sa-popup]")!
    assert.equal(popup.style.left, "28px"); assert.equal(popup.style.top, "232px")
    key(popup.querySelector("[role=menu]")!, "Escape"); await pending
    assert.equal(f.state().entries.length, 0)
  } finally { await f.close() }
})

test("native menu items are added only for session tabs", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const other = f.doc.createElement("button"); f.doc.body.append(other)
    const menu = openNativeMenu(f, other); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Close tab", "Delete session…"])
  } finally { await f.close() }
})

test("choosing a preset from the tab menu's Snooze submenu snoozes that tab's session", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = openNativeMenu(f); await f.flush()
    click(menu.querySelectorAll('[data-sa-menu][role=menuitem]')[0]); await f.flush()
    click(menu.querySelectorAll('[data-sa-sub] [role=menuitem]')[0]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.state().entries[0].id, "s")
  } finally { await f.close() }
})

test("delete confirms permanently; cancel does nothing; confirm calls session.remove, closes tab", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.confirm(false)
    await f.commands.get("delete")!.run(); await f.flush()
    assert.equal(f.calls.confirms.length, 1)
    assert.match(f.calls.confirms[0].description, /permanently/)
    assert.equal(f.calls.confirms[0].danger, true)
    assert.deepEqual(f.calls.removed, [])
    assert.deepEqual(f.calls.closed, [])
    f.confirm(true)
    await f.commands.get("delete")!.run(); await f.flush()
    assert.deepEqual(f.calls.removed, [{ sessionID: "s" }])
    assert.deepEqual(f.calls.closed, ["tab"])
  } finally { await f.close() }
})

test("delete failure shows an error and keeps the tab", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.removeError(true)
    await f.commands.get("delete")!.run(); await f.flush()
    assert.deepEqual(f.calls.closed, [])
    assert.equal(f.calls.toasts.at(-1).variant, "error")
    assert.match(f.calls.toasts.at(-1).description, /server refused/)
  } finally { await f.close() }
})

test("archived rows: one hover action (Restore); right-click offers Restore and Delete…", async () => {
  const f = fixture()
  try {
    f.archived(true); f.setServers(["server"]); f.start(); await f.flush()
    const row = f.doc.querySelector<HTMLElement>("[data-sa-row]")!
    assert.deepEqual([...row.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), ["Restore Session"])
    row.dispatchEvent(new (f.doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
    const items = [...f.doc.querySelectorAll<HTMLElement>("[data-sa-popup] [role=menuitem]")]
    assert.deepEqual(items.map((i) => i.textContent), ["Restore", "Delete…"])
    click(items[1]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.removed, [{ sessionID: "s" }])
  } finally { await f.close() }
})

test("snoozed rows: Wake hover; right-click offers Wake, Archive, Delete…", async () => {
  const f = fixture([{ server: "server", id: "s", title: "Session", at: 1, until: Date.now() + 3_600_000, updated: 1, busy: 0 }])
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(f.doc.querySelector('[data-sa-icon]'), null)
    const row = f.doc.querySelectorAll<HTMLElement>("[data-sa-row]")[0]
    assert.deepEqual([...row.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), ["Wake Session"])
    row.dispatchEvent(new (f.doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
    const items = [...f.doc.querySelectorAll<HTMLElement>("[data-sa-popup] [role=menuitem]")]
    assert.deepEqual(items.map((i) => i.textContent), ["Wake", "Archive", "Delete…"])
    click(items[1]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
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

test("clicking an Archived row opens it without unarchiving; refresh and events leave user-opened archived tabs alone", async () => {
  const f = fixture()
  try {
    f.archived(true); f.setServers(["server"]); f.start(); await f.flush()
    assert.deepEqual(f.calls.closed, [], "refresh must not close a tab the user opened")
    const row = f.doc.querySelector<HTMLElement>("[data-sa-row]")!
    const link = row.querySelector<HTMLElement>("a")!
    assert.equal(link.tabIndex, 0, "Enter on the row link opens it")
    click(link); await f.flush()
    assert.deepEqual(f.calls.opened.at(-1), [{ server: "server", id: "s" }, { focus: true }])
    assert.deepEqual(f.calls.updates, [], "opening is not a restore")
    f.emit("session.archived"); f.emit("session.renamed"); await f.flush()
    assert.deepEqual(f.calls.closed, [])
    assert.equal(f.doc.querySelectorAll("[data-sa-row]").length, 1, "still listed as archived")
  } finally { await f.close() }
})

test("archiving closes the tab at that moment; Restore is the only unarchive and opens the session", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    await f.commands.get("archive")!.run(); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
    assert.deepEqual(f.calls.closed, ["tab"])
    click(f.doc.querySelector('[data-sa-row] button[data-icon="outline-undo"]')); await f.flush()
    assert.deepEqual(f.calls.updates.at(-1), { sessionID: "s", archived: false })
    assert.deepEqual(f.calls.opened.at(-1), [{ server: "server", id: "s" }, { focus: true }])
  } finally { await f.close() }
})

test("regression: deleting an archived row from its context menu confirms, calls remove, and a server failure shows an error toast and keeps the row", async () => {
  const f = fixture()
  try {
    f.archived(true); f.setServers(["server"]); f.start(); await f.flush()
    const rightClick = () => (f.doc.querySelector("[data-sa-row]") as HTMLElement).dispatchEvent(new (f.doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
    f.removeError(true); rightClick()
    click([...f.doc.querySelectorAll("[data-sa-popup] [role=menuitem]")].find((i) => i.textContent === "Delete…")); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(f.calls.confirms.length, 1)
    assert.equal(f.calls.toasts.at(-1).variant, "error")
    assert.match(f.calls.toasts.at(-1).description, /server refused/)
    assert.equal(f.doc.querySelectorAll("[data-sa-row]").length, 1)
    f.removeError(false); rightClick()
    click([...f.doc.querySelectorAll("[data-sa-popup] [role=menuitem]")].find((i) => i.textContent === "Delete…")); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.removed, [{ sessionID: "s" }, { sessionID: "s" }])
  } finally { await f.close() }
})

// A native vertical tab: marks live in `tab-close > tab-status`, which the host marks aria-hidden.
const nativeTab = `<div data-slot="vertical-tabs"><div data-tab-key="tab"><div data-titlebar-tab data-orientation="vertical"><a data-slot="tab-link"><span data-slot="tab-title">Host title</span></a><div data-slot="tab-close"><span data-slot="tab-status" aria-hidden="true"><span data-mark="busy"></span><span data-mark="attention"></span><span data-mark="unread"></span></span><button aria-label="Close tab"></button></div></div></div></div>`
const wakeMark = (f: { doc: Document }) => f.doc.querySelector<HTMLElement>("[data-sa-woke-mark]")
const dueSnooze = (): Snooze => ({ server: "server", id: "s", title: "Session", at: Date.now() - 2_000, until: Date.now() - 1_000, busy: 0, updated: 1 })

test("a woken session gets a labelled clock in its tab's status slot, persisted, and opening it clears the mark", async () => {
  const f = fixture([dueSnooze()])
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.deepEqual(f.woke().entries, [{ server: "server", id: "s" }])
    const mark = wakeMark(f)!
    assert.equal(mark.getAttribute("role"), "img")
    assert.equal(mark.getAttribute("aria-label"), "Woke from snooze")
    assert.equal(mark.previousElementSibling?.getAttribute("data-slot"), "tab-status", "sibling of the host's status slot, which is aria-hidden")
    assert.equal(mark.querySelector("svg")?.getAttribute("width"), "14")
    assert.ok(f.doc.querySelector("[data-titlebar-tab]")?.hasAttribute("data-sa-woke"))
    f.setCurrent(true); await f.flush()
    assert.deepEqual(f.woke().entries, [])
    assert.equal(wakeMark(f), null)
    assert.equal(f.doc.querySelector("[data-titlebar-tab]")?.hasAttribute("data-sa-woke"), false)
  } finally { await f.close() }
})

test("the woke mark survives reload, and a deadline that passed while the app was closed marks at the next load", async () => {
  const f = fixture([], [{ server: "server", id: "s" }])
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); await f.flush()
    assert.ok(wakeMark(f), "persisted mark renders on load")
    f.stop(); assert.equal(wakeMark(f), null, "cleanup removes the node and attribute")
    assert.equal(f.doc.querySelector("[data-titlebar-tab]")?.hasAttribute("data-sa-woke"), false)
    f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll("[data-sa-woke-mark]").length, 1, "no duplicate after reload")
  } finally { await f.close() }
  const closed = fixture([dueSnooze()])
  try {
    closed.doc.body.innerHTML = nativeTab
    closed.setCurrent(false)
    closed.start(); closed.setServers(["server"]); await closed.flush()
    assert.equal(closed.state().entries.length, 0)
    assert.ok(wakeMark(closed))
  } finally { await closed.close() }
})

test("no mark for sessions that were never snoozed, explicit wakes, opened-from-Home wakes, or archived wakes", async () => {
  const f = fixture()
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(wakeMark(f), null)
    assert.deepEqual(f.woke().entries, [])
  } finally { await f.close() }
  const now = Date.now()
  const live = (): Snooze => ({ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 })
  const undo = fixture([live()])
  try {
    undo.setCurrent(false); undo.start(); undo.setServers(["server"]); await undo.flush()
    undo.calls.toasts.length = 0
    undo.reopen(); await undo.flush()
    assert.equal(undo.state().entries.length, 0, "Home or Recently closed opens it and wakes it")
    assert.deepEqual(undo.woke().entries, [], "already opened: no mark")
  } finally { await undo.close() }
  const archived = fixture([dueSnooze()])
  try {
    archived.setCurrent(false); archived.archived(true); archived.start(); archived.setServers(["server"]); await archived.flush()
    assert.deepEqual(archived.woke().entries, [])
  } finally { await archived.close() }
  const current = fixture([dueSnooze()])
  try {
    current.start(); current.setServers(["server"]); await current.flush()
    assert.deepEqual(current.woke().entries, [], "woke while it is the open session: nothing to point at")
  } finally { await current.close() }
})

test("archiving, deleting or re-snoozing a woken session drops its mark", async () => {
  const marked = [{ server: "server", id: "s" }]
  const archive = fixture([], marked)
  try {
    archive.setCurrent(false); archive.start(); archive.setServers(["server"]); await archive.flush()
    archive.emit("session.archived"); await archive.flush()
    assert.deepEqual(archive.woke().entries, [])
  } finally { await archive.close() }
  const deleted = fixture([], marked)
  try {
    deleted.setCurrent(false); deleted.start(); deleted.setServers(["server"]); await deleted.flush()
    deleted.emit("session.deleted"); await deleted.flush()
    assert.deepEqual(deleted.woke().entries, [])
  } finally { await deleted.close() }
  const again = fixture()
  try {
    again.start(); again.setServers(["server"]); await again.flush()
    again.addWoke(); assert.equal(again.woke().entries.length, 1)
    await runSnooze(again); await again.flush()
    assert.equal(again.state().entries.length, 1)
    assert.deepEqual(again.woke().entries, [])
  } finally { await again.close() }
})

test("a pending approval or question outranks the clock: only a CSS precedence, the mark stays in the DOM", async () => {
  const { wokeCss } = await import("./woke")
  assert.match(wokeCss, /\[data-sa-woke\]:not\(\[data-status="attention"\], \[data-active="true"\]\) \[data-sa-woke-mark\] \{ display: grid; \}/)
  assert.match(wokeCss, /\[data-sa-woke\]:not\(\[data-status="attention"\], \[data-active="true"\]\) \[data-slot="tab-status"\] \{ display: none; \}/)
})
