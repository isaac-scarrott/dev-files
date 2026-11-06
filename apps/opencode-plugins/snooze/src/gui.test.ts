import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import plugin from "./gui"
import type { Snooze } from "./snooze"
import { fixture } from "../../session-ui/src/testfixture"
import { provideSink, type Notification } from "../../native-ui/src/notify-contract"

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
const HOST_MENU = (cls: string, labels: string[]) => `<div role="menu" data-component="menu-v2-content" data-appearance="compact" class="${cls}">${labels.map((l) => l === "-" ? '<div data-slot="menu-v2-separator"></div>' : `<div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">${l}</span></div>`).join("")}</div>`
const mount = (f: { doc: Document }, html: string) => { const portal = f.doc.createElement("div"); portal.innerHTML = html; f.doc.body.append(portal); return portal.firstElementChild as HTMLElement }
const HEADER = ["Rename", "Export…", "-", "Delete…"]

// A native vertical tab: marks live in `tab-close > tab-status`, which the host marks aria-hidden.
const nativeTab = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="tab"><div data-titlebar-tab data-orientation="vertical"><a data-slot="tab-link"><span data-slot="tab-title">Host title</span></a><div data-slot="tab-close"><span data-slot="tab-status" aria-hidden="true"><span data-mark="busy"></span><span data-mark="attention"></span><span data-mark="unread"></span></span><button aria-label="Close tab"></button></div></div></div></div></div></aside>`
const wakeMark = (f: { doc: Document }) => f.doc.querySelector<HTMLElement>("[data-notify-mark]")
const dueSnooze = (): Snooze => ({ server: "server", id: "s", title: "Session", at: Date.now() - 2_000, until: Date.now() - 1_000, busy: 0, updated: 1 })
const sleeper = (): Snooze => ({ server: "server", id: "s", title: "Session", at: Date.now(), until: Date.now() + 3_600_000, busy: 0, updated: 1 })

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

test("setup cold-starts, shows the Snoozed group, tears down and reloads without duplicates", async () => {
  const f = fixture(plugin)
  try {
    f.start(); await f.flush()
    assert.match(f.doc.body.textContent, /Snoozed/)
    f.setServers(["server"]); await f.flush()
    assert.match(f.doc.body.textContent, /Snoozed/)
    assert.ok([...f.listeners.values()].every((handlers) => handlers.size === 1))
    f.stop()
    assert.ok([...f.listeners.values()].every((handlers) => handlers.size === 0))
    assert.equal(f.doc.querySelector("[data-sa-groups]"), null)
    f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll("[data-sa-groups]").length, 1)
    assert.equal(f.doc.querySelector('[data-slot="tab-title"]')?.textContent, "Host title")
  } finally { await f.close() }
})

test("snooze persists server+session, closes only tab, shows no toast, and rejects waiting input", async () => {
  const f = fixture(plugin)
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
  const f = fixture(plugin, [{ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 }])
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

test("persisted snooze closes hydrated tab and manual reopening wakes it", async () => {
  const now = Date.now()
  const f = fixture(plugin, [{ server: "server", id: "s", title: "Session", at: now, until: now + 60_000, busy: 0, updated: 1 }])
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    assert.deepEqual(f.calls.closed, ["tab"])
    assert.equal(f.state().entries.length, 1)
    f.reopen(); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
  } finally { await f.close() }
})

test("expired snooze is retained offline and wakes on reconnect", async () => {
  const now = Date.now()
  const f = fixture(plugin, [{ server: "server", id: "s", title: "Session", at: now - 2_000, until: now - 1_000, busy: 0, updated: 1 }])
  try {
    f.setConnected(false); f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(f.state().entries.length, 1)
    assert.equal(f.calls.opened.length, 0)
    f.setConnected(true); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 1)
  } finally { await f.close() }
})

for (const unloaded of ["parent permissions", "parent forms", "child permissions", "child forms", "metadata", "metadata time", "family"] as const) {
  test(`new snooze rejects unloaded ${unloaded}, then accepts hydrated empty requests`, async () => {
    const f = fixture(plugin)
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
  const f = fixture(plugin, [sleeper()])
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
    const f = fixture(plugin, [{ server: "server", id: "s", title: "Session", at: now - 2_000, until: reason === "deadline" ? now - 1_000 : now + 60_000, busy: 0, updated: 1 }])
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
    const f = fixture(plugin, action === "reconcile" ? [sleeper()] : [])
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
  const f = fixture(plugin, [dueSnooze()])
  try {
    f.permissions(undefined); f.forms(undefined); f.archived(true); f.setServers(["server"])
    f.start(); await f.flush()
    assert.equal(f.state().entries.length, 0)
    assert.equal(f.calls.opened.length, 0)
  } finally { await f.close() }
})

test("native tab menu gains a Snooze submenu once, before the native Delete…, keyboard reachable, removed on cleanup", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = openNativeMenu(f); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Close tab", "Snooze", "Delete session…"])
    assert.equal(menu.querySelectorAll("[data-sa-menu][role=menuitem]").length, 1)
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    assert.equal(items[2].dataset.component, "menu-v2-item", "uses the app's item markup")
    assert.ok(items[2].querySelector('[data-slot="menu-v2-item-chevron"]'), "submenu trigger shows the host chevron")
    assert.equal(items[2].getAttribute("aria-haspopup"), "true")
    // Kobalte would wrap from Close tab to Delete…; we step onto our item instead.
    items[1].focus(); key(items[1], "ArrowDown")
    assert.equal(f.doc.activeElement, items[2])
    key(items[2], "ArrowDown")
    assert.equal(f.doc.activeElement, items[3], "then onto the native Delete…")
    // Text change inside the portal never duplicates items.
    menu.append(f.doc.createElement("i")); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 1)
    f.stop()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 0)
  } finally { await f.close() }
})

test("Snooze submenu: opens beside its trigger on ArrowRight with live times, Left/Esc close only it, hover over another item closes it, nothing leaks", async () => {
  const f = fixture(plugin)
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
  const f = fixture(plugin)
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
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const other = f.doc.createElement("button"); f.doc.body.append(other)
    const menu = openNativeMenu(f, other); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Close tab", "Delete session…"])
  } finally { await f.close() }
})

test("choosing a preset from the tab menu's Snooze submenu snoozes that tab's session", async () => {
  const f = fixture(plugin)
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
  const f = fixture(plugin)
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
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.removeError(true)
    await f.commands.get("delete")!.run(); await f.flush()
    assert.deepEqual(f.calls.closed, [])
    assert.equal(f.calls.toasts.at(-1).variant, "error")
    assert.match(f.calls.toasts.at(-1).description, /server refused/)
  } finally { await f.close() }
})

test("snoozed rows: Wake hover; right-click offers Wake, Archive, Delete…, and Archive uses the native API", async () => {
  const f = fixture(plugin, [sleeper()])
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
    assert.equal(f.state().entries.length, 0, "an archived session is no longer snoozed")
  } finally { await f.close() }
})

test("a woken session gets a labelled clock in its tab's status slot, persisted, and opening it clears the mark", async () => {
  const f = fixture(plugin, [dueSnooze()])
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
  const f = fixture(plugin, [dueSnooze()])
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(published.length, 1)
    assert.equal(published[0]!.kind, "info")
    assert.equal(published[0]!.title, "Woke from snooze")
    assert.equal(published[0]!.key, "snooze:woke:server/s")
    assert.deepEqual(published[0]!.target, { server: "server", session: "s" })
    assert.equal(f.calls.toasts.length, 0, "no toast of ours")
    assert.equal(wakeMark(f), null, "the hub draws the mark, not a second clock")
    assert.deepEqual(f.woke().entries, [{ server: "server", id: "s" }], "kept, for when the hub is removed")
    f.setCurrent(true); await f.flush()
    assert.deepEqual(cleared, ["snooze:woke:server/s"])
  } finally { await f.close(); release() }
})

test("without the notifications plugin a wake shows the clock and no toast", async () => {
  const f = fixture(plugin, [dueSnooze()])
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
  const f = fixture(plugin, [], [{ server: "server", id: "s" }])
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
  const closed = fixture(plugin, [dueSnooze()])
  try {
    closed.doc.body.innerHTML = nativeTab
    closed.setCurrent(false)
    closed.start(); closed.setServers(["server"]); await closed.flush()
    assert.equal(closed.state().entries.length, 0)
    assert.ok(wakeMark(closed))
  } finally { await closed.close() }
})

test("no mark for sessions that were never snoozed, explicit wakes, opened-from-Home wakes, or archived wakes", async () => {
  const f = fixture(plugin)
  try {
    f.doc.body.innerHTML = nativeTab
    f.setCurrent(false)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(wakeMark(f), null)
    assert.deepEqual(f.woke().entries, [])
  } finally { await f.close() }
  const undo = fixture(plugin, [sleeper()])
  try {
    undo.setCurrent(false); undo.start(); undo.setServers(["server"]); await undo.flush()
    undo.calls.toasts.length = 0
    undo.reopen(); await undo.flush()
    assert.equal(undo.state().entries.length, 0, "Home or Recently closed opens it and wakes it")
    assert.deepEqual(undo.woke().entries, [], "already opened: no mark")
  } finally { await undo.close() }
  const archived = fixture(plugin, [dueSnooze()])
  try {
    archived.setCurrent(false); archived.archived(true); archived.start(); archived.setServers(["server"]); await archived.flush()
    assert.deepEqual(archived.woke().entries, [])
  } finally { await archived.close() }
  const current = fixture(plugin, [dueSnooze()])
  try {
    current.start(); current.setServers(["server"]); await current.flush()
    assert.deepEqual(current.woke().entries, [], "woke while it is the open session: nothing to point at")
  } finally { await current.close() }
})

test("archiving, deleting or re-snoozing a woken session drops its mark", async () => {
  const marked = [{ server: "server", id: "s" }]
  const archived = fixture(plugin, [], marked)
  try {
    archived.setCurrent(false); archived.start(); archived.setServers(["server"]); await archived.flush()
    archived.emit("session.archived"); await archived.flush()
    assert.deepEqual(archived.woke().entries, [])
  } finally { await archived.close() }
  const deleted = fixture(plugin, [], marked)
  try {
    deleted.setCurrent(false); deleted.start(); deleted.setServers(["server"]); await deleted.flush()
    deleted.emit("session.deleted"); await deleted.flush()
    assert.deepEqual(deleted.woke().entries, [])
  } finally { await deleted.close() }
  const again = fixture(plugin)
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

test("session header menu: Snooze sits directly above the separator and Delete…, resolves the routed session", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "Snooze", "-", "Delete…"])
    menu.append(f.doc.createElement("i")); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 1, "idempotent")
  } finally { await f.close() }
})

test("session menus: draft header disabled, subagent and archived menus untouched, re-render restores items", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.pending(true); f.start(); await f.flush()
    const draft = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.ok([...draft.querySelectorAll("[data-sa-menu]")].every((i) => i.getAttribute("aria-disabled") === "true"))
    f.pending(false); f.parent("p")
    const sub = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual(labelsOf(sub), ["Rename", "Export…", "Delete…"])
    f.parent(undefined); f.archived(true)
    const arch = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.equal(arch.querySelectorAll("[data-sa-menu]").length, 0)
    f.archived(false)
    const other = mount(f, HOST_MENU("", ["Copy", "Paste"])); await f.flush()
    assert.equal(other.querySelectorAll("[data-sa-menu]").length, 0)
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    menu.querySelectorAll("[data-sa-menu]").forEach((n) => n.remove()); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 1, "put back after a host re-render")
    f.stop()
    assert.equal(f.doc.querySelectorAll("[data-sa-menu]").length, 0)
  } finally { await f.close() }
})

test("Home row menu: the row's session gets the Snooze submenu, from a contextmenu or the keyboard", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const row = f.doc.createElement("div"); row.dataset.component = "home-session-row-container"; row.dataset.sessionId = "other"
    row.innerHTML = "<button>x</button>"; f.doc.body.append(row)
    const win = f.doc.defaultView as any
    row.querySelector("button")!.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    const menu = mount(f, HOST_MENU("", HEADER)); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Export…", "Snooze", "Delete…"])
    row.querySelector("button")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }))
    const again = mount(f, HOST_MENU("", HEADER)); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(again.querySelectorAll("[data-sa-menu]").length, 1)
  } finally { await f.close() }
})

test("one scoped observer serves the woke marks, the group and the session menus; a streaming timeline never reaches it", async () => {
  const f = fixture(plugin, [], [{ server: "server", id: "s" }])
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
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 1, "a menu portal is extended")
    menu.append(f.doc.createElement("i")); await new Promise((r) => setTimeout(r, 5))
    assert.ok(seen.callbacks > before, "a portal's later changes are seen")
  } finally { await f.close() }
  assert.equal(seen.disconnected, seen.created, "disconnected on cleanup")
})

test("a setup that throws after acquiring its deadline timer and listeners still releases them (the host runs owner cleanups, not a returned one)", async () => {
  const f = fixture(plugin, [dueSnooze()], [], { openThrows: true })
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
  const f = fixture(plugin, [sleeper()])
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
  const f = fixture(plugin)
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
  const f = fixture(plugin, [sleeper()])
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

test("a user send into a snoozed session unsnoozes it: no mark, any old mark cleared, wake timer cancelled", async () => {
  const timers = new Set<unknown>()
  const f = fixture(plugin, [sleeper()], [{ server: "server", id: "s" }])
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

test("a user send into a session that is neither snoozed nor archived does nothing", async () => {
  const f = fixture(plugin)
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.deliver(); await f.flush()
    assert.equal(f.calls.updates.length, 0)
    assert.equal(f.calls.opened.length, 0)
    assert.equal(f.calls.toasts.length, 0)
  } finally { await f.close() }
})

test("a stamped delivery (peer, monitor, scheduler) wakes a snooze exactly as before, marked", async () => {
  const f = fixture(plugin, [sleeper()])
  try {
    f.start(); f.setServers(["server"]); f.setCurrent(false); await f.flush()
    f.deliver("s", { monitor: { id: "m" } }); await f.flush()
    assert.equal(f.state().entries.length, 0, "inbox delivery wakes a snooze, whoever sent it")
    assert.deepEqual(f.woke().entries, [{ server: "server", id: "s" }], "a wake that was not the user's is marked")
  } finally { await f.close() }
})

test("a user send into a different session leaves a snooze alone", async () => {
  const f = fixture(plugin, [sleeper()])
  try {
    f.start(); f.setServers(["server"]); await f.flush()
    f.deliver("other"); await f.flush()
    assert.equal(f.state().entries.length, 1)
  } finally { await f.close() }
})
