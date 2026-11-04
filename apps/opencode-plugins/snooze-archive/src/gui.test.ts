import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import plugin from "./gui"
import type { Snooze } from "./snooze"
import { delegate, fakeUi } from "./testui"
import { fake } from "../../test-utils/fake"
import { provideSink, type Notification } from "../../native-ui/src/notify-contract"

type Context = Parameters<NonNullable<typeof plugin.setup>>[0]

// `host`: extra markup inside the vertical sidebar; `bound`: command ids the host's keybind lookup answers for; `dedicated`: the client has archive/unarchive calls.
interface Extra { options?: Context["options"]; host?: string; bound?: string[]; dedicated?: boolean; openThrows?: boolean }
function fixture(initial: Snooze[] = [], initialWoke: { server: string; id: string }[] = [], extra: Extra = {}) {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="tab"><div data-titlebar-tab><span data-slot="tab-title">Host title</span></div></div></div></div>${extra.host ?? ""}</aside>`
  const globals = { window, document: doc, Node: window.Node, HTMLElement: window.HTMLElement, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} }
  const previous = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  delegate(doc)
  const [servers, setServers] = createSignal<string[]>([])
  const [state, setState] = createSignal({ entries: initial })
  const [wokeState, setWokeState] = createSignal({ entries: initialWoke })
  const [connected, setConnected] = createSignal(true)
  const listeners = new Map<string, Set<(e: any) => void>>()
  const commands = new Map<string, { run(): Promise<void> | void }>()
  const calls = { closed: [] as string[], opened: [] as unknown[], updates: [] as unknown[], toasts: [] as any[], list: 0, listInputs: [] as any[], requestSync: 0, metadataReads: 0, removed: [] as unknown[], confirms: [] as any[], dedicated: [] as unknown[] }
  let permissions: unknown[] | undefined = []
  let forms: unknown[] | undefined = []
  let family: string[] | undefined = []
  const childRequests = new Map<string, { permissions?: unknown[]; forms?: unknown[] }>()
  let metadata: "ready" | "missing" | "no-time" = "ready"
  let sync = async () => {}
  let archiveError = false
  let listImpl: ((input: any) => any) | undefined
  let getImpl: ((input: any) => any) | undefined
  let select = ""
  let confirmResult = true
  let removeError = false
  const slots: any[] = []
  let archived = false
  let parentID: string | undefined
  const info = () => { calls.metadataReads++; return metadata === "missing" ? undefined : ({ id: "s", title: "Session", parentID, time: metadata === "no-time" ? undefined : { updated: 1, ...(archived ? { archived: 1 } : {}) }, location: { directory: "/repo" } }) }
  const server = {
    id: "server", name: "Local", compatible: true, get connected() { return connected() },
    client: { session: {
      list: async (input: any) => { calls.list++; calls.listInputs.push(input); if (archiveError) throw new Error("offline"); if (listImpl) return listImpl(input); return { data: archived ? [info()] : [], cursor: {} } },
      get: async (input: any) => getImpl ? getImpl(input) : info(),
      remove: async (input: unknown) => { calls.removed.push(input); if (removeError) throw new Error("server refused") },
      update: async (input: { archived: boolean }) => { calls.updates.push(input); if (archiveError) throw new Error("denied"); archived = input.archived },
      ...(extra.dedicated ? {
        archive: async (input: unknown) => { calls.dedicated.push(["archive", input]); archived = true },
        unarchive: async (input: unknown) => { calls.dedicated.push(["unarchive", input]); archived = false },
      } : {}),
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
  const ctx = fake<Context>({
    id: "snooze-archive",
    ui: fakeUi(doc),
    options: extra.options ?? {},
    keybinds: { keybind: (id: string) => extra.bound?.includes(id) ? ["⌘", "K"] : [] },
    router: { path: () => "/" },
    signal: new AbortController().signal,
    stores: { snoozes: { get value() { return state() }, update: (fn: (draft: { entries: Snooze[] }) => void) => {
      const draft = structuredClone(state()); fn(draft); setState(draft)
    } }, woke: { get value() { return wokeState() }, update: (fn: (draft: { entries: { server: string; id: string }[] }) => void) => {
      const draft = structuredClone(wokeState()); fn(draft); setWokeState(draft)
    } } },
    add: (_, item) => { const value = typeof item === "function" ? item() : item; if (value.at) slots.push(value); else if (value.id) commands.set(value.id, value); return () => {} },
    servers: { list: servers, get: (id: string) => servers().includes(id) ? server : undefined },
    sessions: { current: () => current() },
    tabs: { list: tabs, close: (key: string) => { calls.closed.push(key); setTabs((list) => list.filter((tab) => tab.key !== key)) }, open: (...args: unknown[]) => { if (extra.openThrows) throw new Error("open failed"); calls.opened.push(args) } },
    dialogs: { confirm: async (options: unknown) => { calls.confirms.push(options); return confirmResult }, select: async () => select || String(Date.now() + 3_600_000), prompt: async () => "30m" },
    toast: { show: (toast: unknown) => { calls.toasts.push(toast); return { dismiss() {} } } },
  })
  let cleanup: ReturnType<NonNullable<typeof plugin.setup>>
  let dispose = () => {}
  const start = () => createRoot((stop) => { dispose = stop; cleanup = plugin.setup!(ctx) })
  const stop = () => { dispose(); if (typeof cleanup === "function") cleanup() }
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  return {
    calls, commands, listeners, doc, state, addSnooze: (entry: Snooze | undefined) => setState({ entries: entry ? [entry] : [] }), woke: wokeState, addWoke: () => setWokeState({ entries: [{ server: "server", id: "s" }] }), setCurrent: (value: boolean) => setCurrent(value ? session : undefined), start, stop, flush, setServers, setConnected,
    permissions: (value: unknown[] | undefined) => { permissions = value },
    forms: (value: unknown[] | undefined) => { forms = value },
    family: (value: string[] | undefined) => { family = value },
    child: (id: string, value: { permissions?: unknown[]; forms?: unknown[] }) => childRequests.set(id, value),
    metadata: (value: typeof metadata) => { metadata = value },
    sync: (value: () => Promise<void>) => { sync = value },
    archived: (value: boolean) => { archived = value },
    parent: (value: string | undefined) => { parentID = value },
    pending: (value: boolean) => { session.pending = value },
    slots, confirm: (value: boolean) => { confirmResult = value }, removeError: (value: boolean) => { removeError = value },
    fail: (value: boolean) => { archiveError = value },
    select: (value: string) => { select = value },
    listWith: (fn: (input: any) => any) => { listImpl = fn }, getWith: (fn: (input: any) => any) => { getImpl = fn },
    openArchive: () => { const toggle = doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle] button")[1]; if (toggle.getAttribute("aria-expanded") !== "true") toggle.click() },
    reopen: () => setTabs([{ key: "tab", session }]),
    emit: (name: string, sessionID = "s") => listeners.get(name)?.forEach((fn) => fn({ created: Date.now() + 1, data: { sessionID } })),
    // A prompt delivered to a session's inbox; by default what the composer stamps, else what another sender stamps (`null`: nothing).
    deliver: (sessionID = "s", metadata: Record<string, unknown> | null = { displayText: "hi", agent: "build" }, type = "user") => listeners.get("session.inbox.enqueued")?.forEach((fn) => fn({ created: Date.now() + 1, data: { sessionID, item: { type, delivery: "queue", payload: { text: "hi", ...(metadata ? { metadata } : {}) } } } })),
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
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    f.setServers(["server"]); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(f.calls.list, 0, "nothing is fetched until Archived is expanded")
    f.openArchive(); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
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

test("snooze persists server+session, closes only tab, shows no toast, and rejects waiting input", async () => {
  const f = fixture()
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.permissions([{}]); await runSnooze(f)
    assert.equal(f.state().entries.length, 0)
    assert.match(f.calls.toasts.at(-1).description, /waiting/)
    const toastsBefore = f.calls.toasts.length
    f.permissions([]); await runSnooze(f); await f.flush()
    assert.equal(f.calls.toasts.length, toastsBefore, "a successful snooze is silent")
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.state().entries[0].server, "server")
    assert.deepEqual(f.calls.closed, ["tab"])
    assert.equal(f.calls.updates.length, 0, "snooze must not change native archive or stop work")
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
    f.start(); f.setServers(["server"]); await f.flush(); f.openArchive(); await f.flush()
    f.fail(true); await f.commands.get("archive")!.run()
    assert.equal(f.calls.closed.length, 0)
    assert.match(f.calls.toasts.at(-1).description, /denied/)
    f.fail(false); await f.commands.get("archive")!.run(); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    const restore = f.doc.querySelector<HTMLButtonElement>('button[aria-label="Restore Session"]')!
    restore.click(); await f.flush()
    assert.deepEqual(f.calls.updates.at(-1), { sessionID: "s", archived: false })
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(f.calls.opened.length, 1)
    f.setConnected(false); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    f.setConnected(true); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
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
    f.openArchive(); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
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
    assert.deepEqual([...host.querySelectorAll("[data-sa-actions] button")].map((b) => b.getAttribute("aria-label")), ["Archive Session"])
    assert.equal(f.doc.querySelector('[data-slot="session.header"], [data-sa-actions="header"]'), null)
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
    f.openArchive(); await f.flush()
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
    f.openArchive(); await f.flush()
    assert.deepEqual(f.calls.closed, [], "refresh must not close a tab the user opened")
    const row = f.doc.querySelector<HTMLElement>("[data-sa-row]")!
    const link = row.querySelector<HTMLElement>("a")!
    assert.equal(link.tabIndex, 0, "Enter on the row link opens it")
    const routed: string[] = []
    f.doc.body.addEventListener("click", (event) => { const a = (event.target as HTMLElement).closest?.("a[link]"); if (a) { routed.push(a.getAttribute("href")!); event.preventDefault() } })
    click(link); await f.flush()
    assert.deepEqual(routed, ["/server/c2VydmVy/session/s"], "navigates the current tab through the session route")
    assert.deepEqual(f.calls.opened, [], "no sidebar tab is created for an archived session")
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
    f.openArchive(); await f.flush()
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
    f.openArchive(); await f.flush()
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
const nativeTab = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="tab"><div data-titlebar-tab data-orientation="vertical"><a data-slot="tab-link"><span data-slot="tab-title">Host title</span></a><div data-slot="tab-close"><span data-slot="tab-status" aria-hidden="true"><span data-mark="busy"></span><span data-mark="attention"></span><span data-mark="unread"></span></span><button aria-label="Close tab"></button></div></div></div></div></div></aside>`
const wakeMark = (f: { doc: Document }) => f.doc.querySelector<HTMLElement>("[data-notify-mark]")
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
    assert.ok(f.doc.querySelector("[data-titlebar-tab]")?.hasAttribute("data-notify"))
    f.setCurrent(true); await f.flush()
    assert.deepEqual(f.woke().entries, [])
    assert.equal(wakeMark(f), null)
    assert.equal(f.doc.querySelector("[data-titlebar-tab]")?.hasAttribute("data-notify"), false)
  } finally { await f.close() }
})

test("with the notifications plugin the wake is published as info and the hub draws the mark; clearing retracts it", async () => {
  const published: Notification[] = []
  const cleared: string[] = []
  const release = provideSink({ id: "test", accepts: [1], publish: (n) => void published.push(n), clear: (_source, key) => void cleared.push(key) })
  const f = fixture([dueSnooze()])
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(published.length, 1)
    assert.equal(published[0]!.kind, "info")
    assert.equal(published[0]!.title, "Woke from snooze")
    assert.equal(published[0]!.key, "snooze-archive:woke:server/s")
    assert.deepEqual(published[0]!.target, { server: "server", session: "s" })
    assert.equal(f.calls.toasts.length, 0, "no toast of ours")
    assert.equal(wakeMark(f), null, "the hub draws the mark, not a second clock")
    assert.deepEqual(f.woke().entries, [{ server: "server", id: "s" }], "kept, for when the hub is removed")
    f.setCurrent(true); await f.flush()
    assert.deepEqual(cleared, ["snooze-archive:woke:server/s"])
  } finally { await f.close(); release() }
})

test("without the notifications plugin a wake shows the clock and no toast", async () => {
  const f = fixture([dueSnooze()])
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.ok(wakeMark(f))
    assert.equal(wakeMark(f)!.dataset.glyph, "clock")
    assert.equal(f.calls.toasts.length, 0)
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
    assert.equal(f.doc.querySelector("[data-titlebar-tab]")?.hasAttribute("data-notify"), false)
    f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll("[data-notify-mark]").length, 1, "no duplicate after reload")
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
  const { tabMarkCss: wokeCss } = await import("../../native-ui/src/tab-marks")
  assert.match(wokeCss, /\[data-notify\]:not\(\[data-status="attention"\], \[data-active="true"\]\) \[data-notify-mark\] \{ display: grid; \}/)
  assert.match(wokeCss, /\[data-notify\]:not\(\[data-status="attention"\], \[data-active="true"\]\) \[data-slot="tab-status"\] \{ display: none; \}/)
})

test("the clock owns the status slot: sidebar-repos' last-activity label is hidden and the title fade is the host's while it shows", async () => {
  const { tabMarkCss: wokeCss } = await import("../../native-ui/src/tab-marks")
  const shown = '[data-notify]:not([data-status="attention"], [data-active="true"])'
  assert.ok(wokeCss.includes(`${shown} [data-sidebar-time] { display: none; }`), "same condition as the clock itself, so attention and the open tab keep the label rules")
  assert.ok(wokeCss.includes(`${shown}:not(:hover):not(:has(:focus-visible)) { --sidebar-fade: 30px; }`))
})

const HOST_MENU = (cls: string, labels: string[]) => `<div role="menu" data-component="menu-v2-content" data-appearance="compact" class="${cls}">${labels.map((l, i) => (l === "-" ? '<div data-slot="menu-v2-separator"></div>' : `<div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">${l}</span></div>`)).join("")}</div>`
const mount = (f: { doc: Document }, html: string) => { const portal = f.doc.createElement("div"); portal.innerHTML = html; f.doc.body.append(portal); return portal.firstElementChild as HTMLElement }
const HEADER = ["Rename", "Export…", "-", "Delete…"]

test("session header menu: Snooze and Archive sit directly above the separator and Delete…, resolve the routed session, archive works", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "Snooze", "Archive", "-", "Delete…"])
    menu.append(f.doc.createElement("i")); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 2, "idempotent")
    click(menu.querySelectorAll("[data-sa-menu]")[1]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
  } finally { await f.close() }
})

test("session menus: draft header disabled, subagent has no Snooze, archived and unrelated menus untouched, re-render restores items", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.pending(true); f.start(); await f.flush()
    const draft = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.ok([...draft.querySelectorAll("[data-sa-menu]")].every((i) => i.getAttribute("aria-disabled") === "true"))
    f.pending(false); f.parent("p")
    const sub = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual(labelsOf(sub), ["Rename", "Export…", "Archive", "Delete…"])
    f.parent(undefined); f.archived(true)
    const arch = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.equal(arch.querySelectorAll("[data-sa-menu]").length, 0)
    f.archived(false)
    const other = mount(f, HOST_MENU("", ["Copy", "Paste"])); await f.flush()
    assert.equal(other.querySelectorAll("[data-sa-menu]").length, 0)
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    menu.querySelectorAll("[data-sa-menu]").forEach((n) => n.remove()); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 2, "put back after a host re-render")
    f.stop()
    assert.equal(f.doc.querySelectorAll("[data-sa-menu]").length, 0)
  } finally { await f.close() }
})

test("Home row menu: the row's session gets the pair, from a contextmenu or the keyboard", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const row = f.doc.createElement("div"); row.dataset.component = "home-session-row-container"; row.dataset.sessionId = "other"
    row.innerHTML = "<button>x</button>"; f.doc.body.append(row)
    const win = f.doc.defaultView as any
    row.querySelector("button")!.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    const menu = mount(f, HOST_MENU("", HEADER)); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Export…", "Snooze", "Archive", "Delete…"])
    click(menu.querySelectorAll("[data-sa-menu]")[1]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "other", archived: true }])
    f.archived(false)
    row.querySelector("button")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }))
    const again = mount(f, HOST_MENU("", HEADER)); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(again.querySelectorAll("[data-sa-menu]").length, 2)
  } finally { await f.close() }
})

// A server of `total` archived top-level sessions, newest first, paged by index cursors; `mutable` lets a test restore or add some.
function archiveServer(f: ReturnType<typeof fixture>, total: number) {
  const infos = new Map<string, any>()
  const order: string[] = []
  const make = (id: string, updated: number, archived = true) => ({ id, title: `T ${id}`, time: { created: 1, updated, ...(archived ? { archived: updated } : {}) }, location: { directory: "/repo" } })
  for (let i = 0; i < total; i++) { const id = `r${i}`; infos.set(id, make(id, 1000 - i)); order.push(id) }
  f.listWith((input) => {
    // Keyset cursor: the id of the last row returned, so a restore elsewhere shifts nothing.
    const start = input.cursor ? order.indexOf(input.cursor) + 1 : 0
    const live = order.slice(start).filter((id) => infos.get(id).time.archived !== undefined)
    const data = live.slice(0, input.limit).map((id) => infos.get(id))
    return { data, cursor: live.length > input.limit ? { next: data.at(-1).id } : {} }
  })
  f.getWith((input) => infos.get(input.sessionID))
  return {
    restore: (id: string) => { infos.set(id, make(id, infos.get(id).time.updated, false)); f.emit("session.unarchived", id) },
    archiveNew: (id: string, updated: number) => { infos.set(id, make(id, updated)); order.unshift(id); f.emit("session.archived", id) },
  }
}
const archivedIds = (f: { doc: Document }) => [...f.doc.querySelectorAll<HTMLElement>('[data-sa-kind="archived"] [data-sa-row]')].map((row) => row.dataset.saRow!.split("\n")[1])
const moreButton = (f: { doc: Document }, kind: string) => f.doc.querySelector<HTMLButtonElement>(`[data-sa-kind="${kind}"] [data-sa-more]:not([hidden]) button`)

test("Archived loads page by page: 10 first, then 25 per press, no count is shown", async () => {
  const f = fixture()
  try {
    archiveServer(f, 40)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(f.calls.listInputs.length, 0)
    f.openArchive(); await f.flush()
    assert.deepEqual(f.calls.listInputs, [{ archived: true, parentID: null, limit: 10, cursor: undefined }])
    assert.equal(archivedIds(f).length, 10)
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(moreButton(f, "archived")!.textContent, "Show 25 more")
    click(moreButton(f, "archived")); await f.flush()
    assert.deepEqual(f.calls.listInputs.at(-1), { archived: true, parentID: null, limit: 25, cursor: "r9" })
    assert.equal(archivedIds(f).length, 35)
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    click(moreButton(f, "archived")); await f.flush()
    assert.equal(archivedIds(f).length, 40)
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(moreButton(f, "archived"), null, "nothing left: no button")
    assert.equal(new Set(archivedIds(f)).size, 40)
    assert.equal(f.calls.listInputs.length, 3, "no fetch beyond what was asked for")
  } finally { await f.close() }
})

test("restore on page 2 loses and duplicates nothing; a new archive lands first; collapse keeps loaded pages", async () => {
  const f = fixture()
  try {
    const server = archiveServer(f, 60)
    f.start(); f.setServers(["server"]); await f.flush(); f.openArchive(); await f.flush()
    click(moreButton(f, "archived")); await f.flush()
    assert.equal(archivedIds(f).length, 35)
    const calls = f.calls.listInputs.length
    server.restore("r12"); await f.flush()
    const ids = archivedIds(f)
    assert.equal(ids.includes("r12"), false)
    assert.equal(new Set(ids).size, ids.length, "no duplicate rows")
    assert.equal(ids.length, 35, "window refilled from the next page")
    assert.deepEqual(ids, [...Array(36).keys()].filter((i) => i !== 12).map((i) => `r${i}`))
    assert.equal(f.calls.listInputs.length, calls + 1)
    // The refill fetched a whole page (25): all 59 are loaded, so the count is exact and the button names what is left.
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(moreButton(f, "archived")!.textContent, "Show 24 more")
    server.archiveNew("fresh", 2000); await f.flush()
    assert.equal(archivedIds(f)[0], "fresh")
    assert.equal(f.calls.listInputs.length, calls + 1, "an event never refetches the archive")
    const toggle = f.doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle] button")[1]
    toggle.click(); toggle.click(); await f.flush()
    assert.equal(f.calls.listInputs.length, calls + 1, "re-expanding keeps what was loaded")
    assert.equal(new Set(archivedIds(f)).size, archivedIds(f).length)
  } finally { await f.close() }
})

test("an archived group never opened ignores archive events; refresh reloads the pages shown", async () => {
  const f = fixture()
  try {
    const server = archiveServer(f, 30)
    f.start(); f.setServers(["server"]); await f.flush()
    server.archiveNew("fresh", 2000); await f.flush()
    f.commands.get("refresh")!.run(); await f.flush()
    assert.equal(f.calls.listInputs.length, 0)
    f.openArchive(); await f.flush(); click(moreButton(f, "archived")); await f.flush()
    assert.equal(archivedIds(f).length, 31)
    assert.equal(archivedIds(f)[0], "fresh")
    f.calls.listInputs.length = 0
    await f.commands.get("refresh")!.run(); await f.flush()
    assert.deepEqual(f.calls.listInputs.map((i) => [i.limit, i.cursor]), [[10, undefined], [25, "r8"]])
    assert.equal(archivedIds(f).length, 31)
  } finally { await f.close() }
})

test("Snoozed rows are ordered by wake time: the soonest first, whatever order they were snoozed in", async () => {
  const now = Date.now()
  const entries: Snooze[] = [
    { server: "server", id: "late", title: "Late", at: now, until: now + 4 * 86_400_000, busy: 0, updated: 1 },
    { server: "server", id: "soon", title: "Soon", at: now, until: now + 3_600_000, busy: 0, updated: 1 },
    { server: "server", id: "mid", title: "Mid", at: now, until: now + 86_400_000, busy: 0, updated: 1 },
  ]
  const f = fixture(entries)
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    const order = [...f.doc.querySelectorAll<HTMLElement>('[data-sa-kind="snoozed"] [data-sa-row]')].map((row) => row.dataset.saRow?.split("\n")[1])
    assert.deepEqual(order, ["soon", "mid", "late"])
  } finally { await f.close() }
})

test("Snoozed paginates rendering only: 10 rows, label shows what remains, count is exact", async () => {
  const now = Date.now()
  const entries: Snooze[] = Array.from({ length: 12 }, (_, i) => ({ server: "server", id: `z${i}`, title: `Z${i}`, at: now, until: now + 3_600_000 + i, busy: 0, updated: 1 }))
  const f = fixture(entries)
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(f.doc.querySelectorAll('[data-sa-kind="snoozed"] [data-sa-row]').length, 10)
    assert.match(f.doc.body.textContent, /Snoozed12/)
    assert.equal(moreButton(f, "snoozed")!.textContent, "Show 2 more")
    click(moreButton(f, "snoozed")); await f.flush()
    assert.equal(f.doc.querySelectorAll('[data-sa-kind="snoozed"] [data-sa-row]').length, 12)
    assert.equal(moreButton(f, "snoozed"), null)
  } finally { await f.close() }
})

const HOST_ARCHIVED_GROUP = `<section data-slot="vertical-tabs-archived"><button aria-expanded="false">Archived</button></section>`
const archivedSection = (f: { doc: Document }) => f.doc.querySelectorAll<HTMLElement>("[data-snooze-archive] section")[1]
const sidebarRoot = (f: { doc: Document }) => f.doc.querySelector<HTMLElement>("[data-snooze-archive]")!

test("archive guard: on 2.2.5 (no host archive UI) auto reads none and every Archive surface stays", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(sidebarRoot(f).dataset.saArchive, "ours")
    assert.equal(archivedSection(f).hidden, false)
    assert.equal((f.commands.get("archive") as any).enabled, true)
    assert.equal(f.doc.querySelectorAll('[data-sa-actions="tab"]').length, 1)
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "Snooze", "Archive", "-", "Delete…"])
  } finally { await f.close() }
})

test("archive guard: a host archived group stands our Archived group, Archive command, tab button and menu item down; Snooze, Snoozed and Delete stay", async () => {
  const f = fixture([{ server: "server", id: "s", title: "T", at: 1, until: Date.now() + 3_600_000, updated: 1, busy: 0 }], [], { host: HOST_ARCHIVED_GROUP })
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(sidebarRoot(f).dataset.saArchive, "theirs")
    assert.equal(archivedSection(f).hidden, true)
    assert.equal(f.doc.querySelectorAll("[data-sa-kind=snoozed] [data-sa-row]").length, 1, "Snoozed stays")
    assert.equal((f.commands.get("archive") as any).enabled, false)
    assert.equal((f.commands.get("refresh") as any).enabled, false)
    assert.equal((f.commands.get("snooze") as any).enabled, true)
    assert.equal(f.doc.querySelectorAll("[data-sa-actions]").length, 0, "the host's own close control is back")
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "Snooze", "-", "Delete…"])
    f.doc.querySelector<HTMLButtonElement>("[data-sa-kind=snoozed] [data-sa-row]")!.dispatchEvent(new (f.doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }))
    await f.flush()
    assert.deepEqual([...f.doc.querySelectorAll("[data-sa-popup] [role=menuitem]")].map((i) => i.textContent?.trim()), ["Wake", "Delete…"])
  } finally { await f.close() }
})

test("archive guard: standing down fetches nothing from the archive", async () => {
  const f = fixture([], [], { host: HOST_ARCHIVED_GROUP })
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.openArchive(); await f.flush()
    assert.equal(f.calls.list, 0)
  } finally { await f.close() }
})

test("archive guard: a keybind for session.archive (a stale entry in the host's persisted command catalog, as on a 2.2.5 install that ran an older build) stands nothing down; ours forces our UI; theirs forces standing down", async () => {
  const bound = fixture([], [], { bound: ["session.archive", "session.unarchive"] })
  try {
    bound.setServers(["server"]); bound.start(); await bound.flush()
    assert.equal(sidebarRoot(bound).dataset.saArchive, "ours"); assert.equal(sidebarRoot(bound).dataset.saStanddown, undefined)
    assert.equal(archivedSection(bound).hidden, false); assert.equal((bound.commands.get("archive") as any).enabled, true)
  } finally { await bound.close() }
  const ours = fixture([], [], { bound: ["session.archive"], host: HOST_ARCHIVED_GROUP, options: { archive: "ours" } })
  try {
    ours.setServers(["server"]); ours.start(); await ours.flush()
    assert.equal(sidebarRoot(ours).dataset.saArchive, "ours"); assert.equal(archivedSection(ours).hidden, false); assert.equal((ours.commands.get("archive") as any).enabled, true)
  } finally { await ours.close() }
  const theirs = fixture([], [], { options: { archive: "theirs" } })
  try {
    theirs.setServers(["server"]); theirs.start(); await theirs.flush()
    assert.equal(sidebarRoot(theirs).dataset.saArchive, "theirs"); assert.equal(archivedSection(theirs).hidden, true); assert.equal((theirs.commands.get("archive") as any).enabled, false)
  } finally { await theirs.close() }
})

test("archive guard: a native Archive item in a session menu keeps ours out of it and stands our Archive actions down, but the Archived group stays; a later menu without one brings ours back", async () => {
  const f = fixture()
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const native = mount(f, HOST_MENU("session-options-menu", ["Rename", "Archive", "-", "Delete…"])); await f.flush()
    assert.deepEqual([...native.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Archive", "Snooze", "-", "Delete…"])
    assert.equal(sidebarRoot(f).dataset.saArchive, "ours")
    assert.equal(sidebarRoot(f).dataset.saStanddown, "menu")
    assert.equal(archivedSection(f).hidden, false, "a host Archive action does not browse archived sessions")
    native.parentElement!.remove()
    const plain = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.equal(plain.querySelectorAll("[data-sa-menu]").length, 2)
    assert.equal(sidebarRoot(f).dataset.saStanddown, undefined)
  } finally { await f.close() }
})

test("archive guard: archived sessions show in tabs while the host owns archive UI, and our sweep leaves them", async () => {
  const f = fixture([], [], { host: HOST_ARCHIVED_GROUP })
  try {
    f.archived(true); f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(f.doc.querySelector("[data-sa-archived-tab]"), null)
    assert.equal(sidebarRoot(f).dataset.saStanddown, "sidebar")
    assert.equal((f.commands.get("archive") as any).enabled, false); assert.equal((f.commands.get("refresh") as any).enabled, false)
  } finally { await f.close() }
})

test("archive guard: the host's dedicated archive call is used when the client has it", async () => {
  const f = fixture([], [], { dedicated: true })
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    await f.commands.get("archive")!.run(); await f.flush()
    assert.deepEqual(f.calls.dedicated, [["archive", { sessionID: "s" }]])
    assert.deepEqual(f.calls.updates, [])
  } finally { await f.close() }
})

// Counts the observers the plugin creates and what reaches them.
function spyObservers(f: { doc: Document }) {
  const window = f.doc.defaultView as unknown as { MutationObserver: typeof MutationObserver }
  const Original = window.MutationObserver
  const seen = { created: 0, disconnected: 0, callbacks: 0 }
  window.MutationObserver = class extends Original {
    constructor(callback: MutationCallback) {
      seen.created++
      super((records, observer) => { seen.callbacks++; callback(records, observer) })
    }
    disconnect() { seen.disconnected++; super.disconnect() }
  }
  return seen
}

test("one scoped observer serves the guard, tab rows, woke marks, group and session menus; a streaming timeline never reaches it", async () => {
  const f = fixture([], [{ server: "server", id: "s" }])
  const seen = spyObservers(f)
  try {
    f.doc.body.innerHTML = `<div id="root"><main><section id="timeline"></section></main>${nativeTab}</div>`
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(seen.created, 1, "one MutationObserver for the whole plugin")
    const timeline = f.doc.getElementById("timeline")!
    const before = seen.callbacks
    for (let i = 0; i < 50; i++) { const part = f.doc.createElement("p"); part.textContent = `chunk ${i}`; timeline.append(part); part.setAttribute("data-tab-key", "x") }
    await new Promise((r) => setTimeout(r, 5))
    assert.equal(seen.callbacks, before, "mutations outside the sidebar and the body's direct children are not observed")
    const menu = mount(f, HOST_MENU("session-options-menu", ["Rename", "-", "Delete…"])); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length >= 1, true, "a menu portal is extended")
    menu.append(f.doc.createElement("i")); await new Promise((r) => setTimeout(r, 5))
    assert.ok(seen.callbacks > before, "a portal's later changes are seen")
  } finally { await f.close() }
  assert.equal(seen.disconnected, seen.created, "disconnected on cleanup")
})

test("a setup that throws after acquiring its deadline timer and listeners still releases them (the host runs owner cleanups, not a returned one)", async () => {
  const f = fixture([dueSnooze()], [], { openThrows: true })
  const seen = spyObservers(f)
  const win = f.doc.defaultView as unknown as Window
  const added: string[] = []
  const removed: string[] = []
  for (const target of [win, f.doc] as unknown as EventTarget[]) {
    const add = target.addEventListener.bind(target); const remove = target.removeEventListener.bind(target)
    target.addEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject]) => { added.push(type); return add(type, ...rest) }) as never
    target.removeEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject]) => { removed.push(type); return remove(type, ...rest) }) as never
  }
  const intervals = new Set<unknown>()
  const setIt = win.setTimeout.bind(win); const clearIt = win.clearTimeout.bind(win)
  win.setTimeout = ((...args: Parameters<typeof setTimeout>) => { const id = setIt(...args); intervals.add(id); return id }) as never
  win.clearTimeout = ((id: never) => { intervals.delete(id); clearIt(id) }) as never
  try {
    f.setServers(["server"])
    assert.throws(() => f.start(), /open failed/)
    assert.ok(added.length > 0 && intervals.size === 1, "acquired before the throw")
    f.stop()
    assert.equal(intervals.size, 0, "interval cleared")
    assert.deepEqual([...removed].sort(), [...added].sort(), "every listener removed")
    assert.equal(seen.disconnected, seen.created)
  } finally { await f.close() }
})

test("focus checks deadlines; the server is asked again only after the window was away", async () => {
  const f = fixture([{ server: "server", id: "s", title: "Session", at: Date.now(), until: Date.now() + 3_600_000, busy: 0, updated: 1 }])
  const win = f.doc.defaultView as unknown as Window
  const real = Date.now
  let skew = 0
  Date.now = () => real() + skew
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const base = f.calls.requestSync
    win.dispatchEvent(new (win as any).Event("focus")); await f.flush()
    assert.equal(f.calls.requestSync, base, "focus without being away does not reconcile")
    win.dispatchEvent(new (win as any).Event("blur"))
    skew = 90_000
    win.dispatchEvent(new (win as any).Event("focus")); await f.flush()
    assert.ok(f.calls.requestSync > base, "back after a minute away reconciles")
  } finally { Date.now = real; await f.close() }
})

test("one timeout waits for the nearest deadline; with nothing snoozed there is none", async () => {
  const f = fixture()
  const win = f.doc.defaultView as unknown as Window
  const live = new Set<unknown>()
  const setIt = win.setTimeout.bind(win); const clearIt = win.clearTimeout.bind(win)
  win.setTimeout = ((...args: Parameters<typeof setTimeout>) => { const id = setIt(...args); live.add(id); return id }) as never
  win.clearTimeout = ((id: never) => { live.delete(id); clearIt(id) }) as never
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(live.size, 0, "no snoozes: no timer, and no polling")
    const entry: Snooze = { server: "server", id: "s", title: "Session", at: Date.now(), until: Date.now() + 3_600_000, busy: 0, updated: 1 }
    f.state(); f.addSnooze(entry); await f.flush()
    assert.equal(live.size, 1, "one timeout waits for the deadline")
    f.addSnooze(undefined); await f.flush()
    assert.equal(live.size, 0, "the last snooze clears it")
  } finally { await f.close() }
})

test("the remaining-time labels refresh on a 30 s interval only while the Snoozed group is open", async () => {
  const f = fixture([{ server: "server", id: "s", title: "Session", at: Date.now(), until: Date.now() + 3_600_000, busy: 0, updated: 1 }])
  const win = f.doc.defaultView as unknown as Window
  const live = new Set<unknown>()
  const setIt = win.setInterval.bind(win); const clearIt = win.clearInterval.bind(win)
  win.setInterval = ((...args: Parameters<typeof setInterval>) => { const id = setIt(...args); live.add(id); return id }) as never
  win.clearInterval = ((id: never) => { live.delete(id); clearIt(id) }) as never
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(live.size, 0, "closed group: nothing to refresh")
    const toggle = f.doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle] button")[0]
    toggle.click(); await f.flush()
    assert.equal(live.size, 1)
    toggle.click(); await f.flush()
    assert.equal(live.size, 0)
  } finally { await f.close() }
})

const sleeper = (): Snooze => ({ server: "server", id: "s", title: "Session", at: Date.now(), until: Date.now() + 3_600_000, busy: 0, updated: 1 })

test("a user send into a snoozed session unsnoozes it: no mark, any old mark cleared, wake timer cancelled", async () => {
  const timers = new Set<unknown>()
  const f = fixture([sleeper()], [{ server: "server", id: "s" }])
  try {
    const win = globalThis.window as unknown as { setTimeout: (...a: any[]) => unknown; clearTimeout: (id: unknown) => void }
    const [set, clear] = [win.setTimeout.bind(win), win.clearTimeout.bind(win)]
    win.setTimeout = (...a: any[]) => { const id = set(...a); timers.add(id); return id }
    win.clearTimeout = (id: unknown) => { timers.delete(id); clear(id) }
    f.start(); f.setServers(["server"]); f.setCurrent(false); await f.flush()
    assert.ok(timers.size > 0, "a deadline timer exists while snoozed")
    f.deliver(); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.deepEqual(f.woke().entries, [], "an explicit send clears the woke mark")
    assert.equal(timers.size, 0, "no wake timer is left")
    assert.equal(f.calls.updates.length, 0)
    assert.equal(f.calls.opened.length, 1)
  } finally { await f.close() }
})

test("a user send into an archived session unarchives it once, without opening a tab", async () => {
  const f = fixture()
  try {
    f.archived(true)
    f.start(); f.setServers(["server"]); await f.flush(); f.openArchive(); await f.flush()
    assert.equal(f.doc.querySelectorAll('button[aria-label="Restore Session"]').length, 1)
    f.deliver(); f.deliver(); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: false }], "double delivery writes once")
    f.deliver(); await f.flush()
    assert.equal(f.calls.updates.length, 1, "already unarchived: nothing to write")
    assert.equal(f.doc.querySelectorAll('button[aria-label="Restore Session"]').length, 0, "the Archived row is gone")
    assert.equal(f.calls.opened.length, 0)
    assert.equal(f.calls.toasts.length, 0)
  } finally { await f.close() }
})

test("a user send into a session that is neither snoozed nor archived does nothing", async () => {
  const f = fixture()
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.deliver(); await f.flush()
    assert.equal(f.calls.updates.length, 0)
    assert.equal(f.calls.opened.length, 0)
    assert.equal(f.calls.toasts.length, 0)
  } finally { await f.close() }
})

test("a stamped delivery (peer, monitor, scheduler) never unarchives, and wakes a snooze exactly as before, marked", async () => {
  const archived = fixture()
  try {
    archived.archived(true)
    archived.start(); archived.setServers(["server"]); await archived.flush()
    for (const stamp of [{ monitor: {} }, { scheduledTask: {} }, { peerMessage: {} }, { anything: 1 }]) archived.deliver("s", stamp)
    archived.deliver("s", null); archived.deliver("s", { displayText: "x" }, "synthetic"); archived.deliver("s", null, "compaction")
    await archived.flush()
    assert.equal(archived.calls.updates.length, 0)
  } finally { await archived.close() }
  const snoozed = fixture([sleeper()])
  try {
    snoozed.start(); snoozed.setServers(["server"]); snoozed.setCurrent(false); await snoozed.flush()
    snoozed.deliver("s", { monitor: { id: "m" } }); await snoozed.flush()
    assert.equal(snoozed.state().entries.length, 0, "inbox delivery wakes a snooze, whoever sent it (unchanged)")
    assert.deepEqual(snoozed.woke().entries, [{ server: "server", id: "s" }], "and a wake that was not the user's is marked")
  } finally { await snoozed.close() }
})

test("a failed unarchive on send toasts, leaves the session archived and the next send retries", async () => {
  const f = fixture()
  try {
    f.archived(true)
    f.start(); f.setServers(["server"]); await f.flush(); f.openArchive(); await f.flush()
    f.fail(true); f.deliver(); await f.flush()
    assert.match(f.calls.toasts.at(-1).description, /denied/)
    assert.equal(f.doc.querySelectorAll('button[aria-label="Restore Session"]').length, 1)
    f.fail(false); f.deliver(); await f.flush()
    assert.equal(f.doc.querySelectorAll('button[aria-label="Restore Session"]').length, 0)
    assert.equal(f.calls.updates.length, 2)
  } finally { await f.close() }
})

test("a user send into a different session leaves a snooze alone", async () => {
  const f = fixture([sleeper()])
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.deliver("other"); await f.flush()
    assert.equal(f.state().entries.length, 1)
  } finally { await f.close() }
})
