import assert from "node:assert/strict"
import { test } from "node:test"
import plugin from "./gui"
import { fixture } from "../../session-ui/src/testfixture"

const click = (el: Element | null | undefined) => (el as HTMLElement).click()
const key = (el: Element, name: string) => el.dispatchEvent(new (el.ownerDocument.defaultView as any).KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))
const labelsOf = (menu: Element) => [...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)
const HOST_MENU = (cls: string, labels: string[]) => `<div role="menu" data-component="menu-v2-content" data-appearance="compact" class="${cls}">${labels.map((l) => l === "-" ? '<div data-slot="menu-v2-separator"></div>' : `<div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">${l}</span></div>`).join("")}</div>`
const mount = (f: { doc: Document }, html: string) => { const portal = f.doc.createElement("div"); portal.innerHTML = html; f.doc.body.append(portal); return portal.firstElementChild as HTMLElement }
const HEADER = ["Rename", "Export…", "-", "Delete…"]
const NATIVE_MENU = `<div role="menu" data-component="menu-v2-content" data-appearance="compact"><div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">Rename</span></div><div role="menuitem" tabindex="-1" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">Close tab</span></div><div data-slot="menu-v2-separator"></div><div role="menuitem" tabindex="-1" data-component="menu-v2-item" data-variant="critical"><span data-slot="menu-v2-item-content">Delete session…</span></div></div>`
// The live menu has no aria-labelledby; the contextmenu event on the tab is the only link.
function openNativeMenu(f: { doc: Document }, target: Element = f.doc.querySelector("[data-tab-key] [data-slot='tab-title']")!) {
  target.dispatchEvent(new (f.doc.defaultView as any).MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  const portal = f.doc.createElement("div")
  portal.innerHTML = NATIVE_MENU
  f.doc.body.append(portal)
  return portal.firstElementChild as HTMLElement
}
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
const moreButton = (f: { doc: Document }) => f.doc.querySelector<HTMLButtonElement>('[data-sa-kind="archived"] [data-sa-more]:not([hidden]) button')
const sidebarRoot = (f: { doc: Document }) => f.doc.querySelector<HTMLElement>("[data-sa-groups]")!
const archivedSection = (f: { doc: Document }) => f.doc.querySelector<HTMLElement>('[data-sa-group="archived"]')!
const HOST_ARCHIVED_GROUP = `<section data-slot="vertical-tabs-archived"><button aria-expanded="false">Archived</button></section>`

test("setup cold-starts with the Archived group collapsed, fetches nothing until it is expanded, and reloads cleanly", async () => {
  const f = fixture(plugin)
  try {
    f.start(); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    f.setServers(["server"]); await f.flush()
    assert.equal(f.calls.list, 0, "nothing is fetched until Archived is expanded")
    f.openArchive(); await f.flush()
    assert.equal(f.calls.list, 1)
    assert.ok([...f.listeners.values()].every((handlers) => handlers.size === 1))
    f.stop()
    assert.ok([...f.listeners.values()].every((handlers) => handlers.size === 0))
    assert.equal(f.doc.querySelector("[data-sa-groups]"), null)
    f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll("[data-sa-groups]").length, 1)
    assert.equal(f.doc.querySelector('[data-slot="tab-title"]')?.textContent, "Host title")
  } finally { await f.close() }
})

test("tab hover shows only Archive beside the host title and cleans up; the native close control is untouched", async () => {
  const f = fixture(plugin)
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
  const f = fixture(plugin)
  try { f.setServers(["server"]); f.start(); await f.flush(); assert.equal(f.slots.some((slot) => slot.at === "session.header"), false) } finally { await f.close() }
})

test("native tab menu gains Archive once, before the native Delete…, keyboard reachable, removed on cleanup", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = openNativeMenu(f); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Close tab", "Archive", "Delete session…"])
    assert.equal(menu.querySelectorAll("[data-sa-menu][role=menuitem]").length, 1)
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    assert.equal(items[2].dataset.component, "menu-v2-item", "uses the app's item markup")
    items[1].focus(); key(items[1], "ArrowDown")
    assert.equal(f.doc.activeElement, items[2])
    key(items[2], "ArrowDown")
    assert.equal(f.doc.activeElement, items[3], "then onto the native Delete…")
    key(items[3], "ArrowUp"); assert.equal(f.doc.activeElement, items[2])
    // Text change inside the portal never duplicates items.
    menu.append(f.doc.createElement("i")); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 1)
    key(items[2], "Enter"); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
    f.stop()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 0)
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

test("archive failure keeps tabs; confirmed archive count and restore use native API", async () => {
  const f = fixture(plugin)
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
    assert.match(f.doc.body.textContent, /offline/)
    f.setConnected(true); await f.flush()
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
  } finally { await f.close() }
})

test("archived rows: one hover action (Restore); right-click offers Restore and Delete…", async () => {
  const f = fixture(plugin)
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

test("cold SDK state: tab actions tolerate undefined titles and lists", async () => {
  const f = fixture(plugin)
  try {
    f.metadata("missing"); f.permissions(undefined); f.forms(undefined); f.family(undefined)
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(f.doc.querySelectorAll('[data-sa-actions="tab"]').length, 1)
  } finally { await f.close() }
})

test("clicking an Archived row opens it without unarchiving; refresh and events leave user-opened archived tabs alone", async () => {
  const f = fixture(plugin)
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
  const f = fixture(plugin)
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
  const f = fixture(plugin)
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

test("Archived loads page by page: 10 first, then 25 per press, no count is shown", async () => {
  const f = fixture(plugin)
  try {
    archiveServer(f, 40)
    f.start(); f.setServers(["server"]); await f.flush()
    assert.equal(f.calls.listInputs.length, 0)
    f.openArchive(); await f.flush()
    assert.deepEqual(f.calls.listInputs, [{ archived: true, parentID: null, limit: 10, cursor: undefined }])
    assert.equal(archivedIds(f).length, 10)
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(moreButton(f)!.textContent, "Show 25 more")
    click(moreButton(f)); await f.flush()
    assert.deepEqual(f.calls.listInputs.at(-1), { archived: true, parentID: null, limit: 25, cursor: "r9" })
    assert.equal(archivedIds(f).length, 35)
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    click(moreButton(f)); await f.flush()
    assert.equal(archivedIds(f).length, 40)
    assert.match(f.doc.body.textContent, /Archived(?![\d—+])/)
    assert.equal(moreButton(f), null, "nothing left: no button")
    assert.equal(new Set(archivedIds(f)).size, 40)
    assert.equal(f.calls.listInputs.length, 3, "no fetch beyond what was asked for")
  } finally { await f.close() }
})

test("restore on page 2 loses and duplicates nothing; a new archive lands first; collapse keeps loaded pages", async () => {
  const f = fixture(plugin)
  try {
    const server = archiveServer(f, 60)
    f.start(); f.setServers(["server"]); await f.flush(); f.openArchive(); await f.flush()
    click(moreButton(f)); await f.flush()
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
    assert.equal(moreButton(f)!.textContent, "Show 24 more")
    server.archiveNew("fresh", 2000); await f.flush()
    assert.equal(archivedIds(f)[0], "fresh")
    assert.equal(f.calls.listInputs.length, calls + 1, "an event never refetches the archive")
    const toggle = f.doc.querySelector<HTMLButtonElement>('[data-sa-group="archived"] [data-sa-toggle] button')!
    toggle.click(); toggle.click(); await f.flush()
    assert.equal(f.calls.listInputs.length, calls + 1, "re-expanding keeps what was loaded")
    assert.equal(new Set(archivedIds(f)).size, archivedIds(f).length)
  } finally { await f.close() }
})

test("an archived group never opened ignores archive events; refresh reloads the pages shown", async () => {
  const f = fixture(plugin)
  try {
    const server = archiveServer(f, 30)
    f.start(); f.setServers(["server"]); await f.flush()
    server.archiveNew("fresh", 2000); await f.flush()
    f.commands.get("refresh")!.run(); await f.flush()
    assert.equal(f.calls.listInputs.length, 0)
    f.openArchive(); await f.flush(); click(moreButton(f)); await f.flush()
    assert.equal(archivedIds(f).length, 31)
    assert.equal(archivedIds(f)[0], "fresh")
    f.calls.listInputs.length = 0
    await f.commands.get("refresh")!.run(); await f.flush()
    assert.deepEqual(f.calls.listInputs.map((i) => [i.limit, i.cursor]), [[10, undefined], [25, "r8"]])
    assert.equal(archivedIds(f).length, 31)
  } finally { await f.close() }
})

test("archive guard: on 2.2.5 (no host archive UI) auto reads none and every Archive surface stays", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(sidebarRoot(f).dataset.saArchive, "ours")
    assert.equal(archivedSection(f).hidden, false)
    assert.equal((f.commands.get("archive") as any).enabled, true)
    assert.equal(f.doc.querySelectorAll('[data-sa-actions="tab"]').length, 1)
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "Archive", "-", "Delete…"])
  } finally { await f.close() }
})

test("archive guard: a host archived group stands our Archived group, Archive command, tab button and menu item down", async () => {
  const f = fixture(plugin, [], [], { host: HOST_ARCHIVED_GROUP })
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(sidebarRoot(f).dataset.saArchive, "theirs")
    assert.equal(archivedSection(f).hidden, true)
    assert.equal((f.commands.get("archive") as any).enabled, false)
    assert.equal((f.commands.get("refresh") as any).enabled, false)
    assert.equal(f.doc.querySelectorAll("[data-sa-actions]").length, 0, "the host's own close control is back")
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "-", "Delete…"])
  } finally { await f.close() }
})

test("archive guard: standing down fetches nothing from the archive", async () => {
  const f = fixture(plugin, [], [], { host: HOST_ARCHIVED_GROUP })
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    f.openArchive(); await f.flush()
    assert.equal(f.calls.list, 0)
  } finally { await f.close() }
})

test("archive guard: a keybind for session.archive (a stale entry in the host's persisted command catalog) stands nothing down; ours forces our UI; theirs forces standing down", async () => {
  const bound = fixture(plugin, [], [], { bound: ["session.archive", "session.unarchive"] })
  try {
    bound.setServers(["server"]); bound.start(); await bound.flush()
    assert.equal(sidebarRoot(bound).dataset.saArchive, "ours"); assert.equal(sidebarRoot(bound).dataset.saStanddown, undefined)
    assert.equal(archivedSection(bound).hidden, false); assert.equal((bound.commands.get("archive") as any).enabled, true)
  } finally { await bound.close() }
  const ours = fixture(plugin, [], [], { bound: ["session.archive"], host: HOST_ARCHIVED_GROUP, options: { archive: "ours" } })
  try {
    ours.setServers(["server"]); ours.start(); await ours.flush()
    assert.equal(sidebarRoot(ours).dataset.saArchive, "ours"); assert.equal(archivedSection(ours).hidden, false); assert.equal((ours.commands.get("archive") as any).enabled, true)
  } finally { await ours.close() }
  const theirs = fixture(plugin, [], [], { options: { archive: "theirs" } })
  try {
    theirs.setServers(["server"]); theirs.start(); await theirs.flush()
    assert.equal(sidebarRoot(theirs).dataset.saArchive, "theirs"); assert.equal(archivedSection(theirs).hidden, true); assert.equal((theirs.commands.get("archive") as any).enabled, false)
  } finally { await theirs.close() }
})

test("archive guard: a native Archive item in a session menu keeps ours out of it and stands our Archive actions down, but the Archived group stays; a later menu without one brings ours back", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const native = mount(f, HOST_MENU("session-options-menu", ["Rename", "Archive", "-", "Delete…"])); await f.flush()
    assert.deepEqual([...native.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Archive", "-", "Delete…"])
    assert.equal(sidebarRoot(f).dataset.saArchive, "ours")
    assert.equal(sidebarRoot(f).dataset.saStanddown, "menu")
    assert.equal(archivedSection(f).hidden, false, "a host Archive action does not browse archived sessions")
    native.parentElement!.remove()
    const plain = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.equal(plain.querySelectorAll("[data-sa-menu]").length, 1)
    assert.equal(sidebarRoot(f).dataset.saStanddown, undefined)
  } finally { await f.close() }
})

test("archive guard: archived sessions show in tabs while the host owns archive UI, and our sweep leaves them", async () => {
  const f = fixture(plugin, [], [], { host: HOST_ARCHIVED_GROUP })
  try {
    f.archived(true); f.setServers(["server"]); f.start(); await f.flush()
    assert.equal(f.doc.querySelector("[data-sa-archived-tab]"), null)
    assert.equal(sidebarRoot(f).dataset.saStanddown, "sidebar")
    assert.equal((f.commands.get("archive") as any).enabled, false); assert.equal((f.commands.get("refresh") as any).enabled, false)
  } finally { await f.close() }
})

test("archive guard: the host's dedicated archive call is used when the client has it", async () => {
  const f = fixture(plugin, [], [], { dedicated: true })
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    await f.commands.get("archive")!.run(); await f.flush()
    assert.deepEqual(f.calls.dedicated, [["archive", { sessionID: "s" }]])
    assert.deepEqual(f.calls.updates, [])
  } finally { await f.close() }
})

test("session header menu: Archive sits directly above the separator and Delete…, resolves the routed session, archive works", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const menu = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.deepEqual([...menu.children].map((c) => c.getAttribute("data-slot") === "menu-v2-separator" ? "-" : c.textContent), ["Rename", "Export…", "Archive", "-", "Delete…"])
    menu.append(f.doc.createElement("i")); await f.flush()
    assert.equal(menu.querySelectorAll("[data-sa-menu]").length, 1, "idempotent")
    click(menu.querySelectorAll("[data-sa-menu]")[0]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "s", archived: true }])
  } finally { await f.close() }
})

test("session menus: draft header disabled, archived and unrelated menus untouched, re-render restores items", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.pending(true); f.start(); await f.flush()
    const draft = mount(f, HOST_MENU("session-options-menu", HEADER)); await f.flush()
    assert.ok([...draft.querySelectorAll("[data-sa-menu]")].every((i) => i.getAttribute("aria-disabled") === "true"))
    f.pending(false)
    f.archived(true)
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

test("Home row menu: the row's session gets Archive, from a contextmenu or the keyboard", async () => {
  const f = fixture(plugin)
  try {
    f.setServers(["server"]); f.start(); await f.flush()
    const row = f.doc.createElement("div"); row.dataset.component = "home-session-row-container"; row.dataset.sessionId = "other"
    row.innerHTML = "<button>x</button>"; f.doc.body.append(row)
    const win = f.doc.defaultView as any
    row.querySelector("button")!.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    const menu = mount(f, HOST_MENU("", HEADER)); await f.flush()
    assert.deepEqual(labelsOf(menu), ["Rename", "Export…", "Archive", "Delete…"])
    click(menu.querySelectorAll("[data-sa-menu]")[0]); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.deepEqual(f.calls.updates, [{ sessionID: "other", archived: true }])
    f.archived(false)
    row.querySelector("button")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }))
    const again = mount(f, HOST_MENU("", HEADER)); await new Promise((r) => setTimeout(r, 5)); await f.flush()
    assert.equal(again.querySelectorAll("[data-sa-menu]").length, 1)
  } finally { await f.close() }
})

test("one scoped observer serves the guard, tab rows, group and session menus; a streaming timeline never reaches it", async () => {
  const f = fixture(plugin)
  const seen = spyObservers(f)
  try {
    f.doc.body.innerHTML = `<div id="root"><main><section id="timeline"></section></main><aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="tab"><div data-titlebar-tab><span data-slot="tab-title">Host title</span></div></div></div></div></aside></div>`
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

test("a user send into an archived session unarchives it once, without opening a tab", async () => {
  const f = fixture(plugin)
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

test("a stamped delivery (peer, monitor, scheduler) never unarchives", async () => {
  const f = fixture(plugin)
  try {
    f.archived(true)
    f.start(); f.setServers(["server"]); await f.flush()
    for (const stamp of [{ monitor: {} }, { scheduledTask: {} }, { peerMessage: {} }, { anything: 1 }]) f.deliver("s", stamp)
    f.deliver("s", null); f.deliver("s", { displayText: "x" }, "synthetic"); f.deliver("s", null, "compaction")
    await f.flush()
    assert.equal(f.calls.updates.length, 0)
  } finally { await f.close() }
})

test("a failed unarchive on send toasts, leaves the session archived and the next send retries", async () => {
  const f = fixture(plugin)
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
