import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { Window } from "happy-dom"
import { withHub } from "./testui"
import { createGuard, hasNativeArchive, parseArchiveOption, probeHome, probeSidebar, reasonsOf, standsDown, type Signals } from "./guard"

const doc = (html: string) => { const w = new Window(); w.document.body.innerHTML = html; return w.document as unknown as Document }
const none: Signals = { command: false, menu: false, home: false, sidebar: false }

// The three states, as shapes the detector reads. `NONE` is the 2.2.5 vertical sidebar (app/src/shell/titlebar/tab-strip.tsx, shell.tsx).
const NONE = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="a" data-titlebar-tab></div></div></div><div data-slot="vertical-tabs-footer"></div></aside>`
const HOST_GROUP = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="a"></div><section data-slot="vertical-tabs-archived"><button aria-expanded="false">Archived</button></section></div></div></aside>`
// The experimental Inbox layout of 2.2.5: its own Archived section and Archive menu item, in a different sidebar.
const INBOX = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="sidebar-inbox"><div data-slot="sidebar-inbox-scroll"><div class="h-6">Archived</div><div data-slot="sidebar-inbox-item"></div></div></div></aside>`
const OURS = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-snooze-archive data-sa-archive="ours"><section><div data-sa-contents data-sa-kind="archived" id="snooze-archive-archived"><div data-slot="archived-row"></div></div></section></div></div></div></aside>`
const MENU = (...items: string[]) => `<div role="menu" data-component="menu-v2-content">${items.join("")}</div>`
const ITEM = (label: string, attrs = "") => `<div role="menuitem" ${attrs}><span>${label}</span></div>`

test("the option reads auto, ours, theirs; anything else is auto", () => {
  assert.deepEqual([undefined, "auto", "ours", "theirs", "THEIRS", 1, null, {}].map(parseArchiveOption), ["auto", "auto", "ours", "theirs", "auto", "auto", "auto", "auto"])
})

test("stand-down: auto follows any signal, ours never, theirs always", () => {
  assert.deepEqual(reasonsOf({ ...none, home: true, sidebar: true }), ["home", "sidebar"])
  for (const reason of Object.keys(none) as (keyof Signals)[]) {
    assert.equal(standsDown("auto", { ...none, [reason]: true }), true, reason)
    assert.equal(standsDown("ours", { ...none, [reason]: true }), false, reason)
  }
  assert.equal(standsDown("auto", none), false)
  assert.equal(standsDown("theirs", none), true)
  assert.equal(standsDown("ours", none), false)
})

test("sidebar probe: 2.2.5 reads none; a host archived group reads present; the Inbox layout and our own group do not count", () => {
  assert.equal(probeSidebar(doc(NONE)), false)
  assert.equal(probeSidebar(doc("")), false)
  assert.equal(probeSidebar(doc(HOST_GROUP)), true)
  assert.equal(probeSidebar(doc(HOST_GROUP.replace('data-slot="vertical-tabs-archived"', 'data-component="sidebar-archived-group"'))), true)
  assert.equal(probeSidebar(doc(INBOX)), false)
  assert.equal(probeSidebar(doc(OURS)), false)
  assert.equal(probeSidebar(doc(`<section data-slot="vertical-tabs-archived"></section>`)), false, "outside the vertical sidebar")
})

test("home probe: the button is seen, rows without it clear it, no rows says nothing", () => {
  const row = `<div data-component="home-session-row-container" data-session-id="s"></div>`
  assert.equal(probeHome(doc("")), undefined)
  assert.equal(probeHome(doc(row)), false)
  assert.equal(probeHome(doc(`${row}<button data-action="home-session-archive"></button>`)), true)
})

test("menu probe: 2.2.5's menus read none; a native Archive or Unarchive item reads present; our own items do not count", () => {
  const menu = (html: string) => doc(html).body.firstElementChild!
  assert.equal(hasNativeArchive(menu(MENU(ITEM("Rename"), ITEM("Export…"), ITEM("Delete…")))), false)
  assert.equal(hasNativeArchive(menu(MENU(ITEM("Rename"), ITEM("Archive"), ITEM("Delete…")))), true)
  assert.equal(hasNativeArchive(menu(MENU(ITEM("Unarchive")))), true)
  assert.equal(hasNativeArchive(menu(MENU(ITEM("Rename", 'data-action="session-archive"')))), true)
  assert.equal(hasNativeArchive(menu(MENU(ITEM("Archive", "data-sa-menu"), ITEM("Snooze", "data-sa-menu")))), false)
  assert.equal(hasNativeArchive(menu(MENU(ITEM("Archived sessions guide")))), false, "whole label only")
})

const guard = (html: string, option: "auto" | "ours" | "theirs", bound: string[] = []) => {
  const d = doc(html)
  const [keys, setKeys] = createSignal(bound)
  const [path, setPath] = createSignal("/")
  const rig = withHub(d, (hub) => createGuard({ doc: d, option, keybound: (id) => keys().includes(id), path, hub }), function (this: unknown, fn) { assert.equal(this, undefined, "called bare, as the browser's requestAnimationFrame needs"); queueMicrotask(fn); return 1 })
  const g = Object.assign(rig.value, { dispose: rig.stop })
  return { g, d, setKeys, setPath }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

test("guard: none stays ours; a host command, menu item, sidebar group or Home button each stand it down, and each reverses", async () => {
  const f = guard(NONE, "auto")
  assert.equal(f.g.standDown(), false)
  assert.deepEqual(f.g.reasons(), [])

  f.setKeys(["session.archive"]); assert.deepEqual(f.g.reasons(), ["command"]); assert.equal(f.g.standDown(), true)
  f.setKeys([]); assert.equal(f.g.standDown(), false)

  f.g.menu(true); assert.deepEqual(f.g.reasons(), ["menu"]); assert.equal(f.g.standDown(), true)
  f.g.menu(false); assert.equal(f.g.standDown(), false)

  const scroll = f.d.querySelector('[data-slot="vertical-tabs-scroll"]')!
  const group = f.d.createElement("section"); group.setAttribute("data-slot", "vertical-tabs-archived")
  scroll.append(group); await settle()
  assert.deepEqual(f.g.reasons(), ["sidebar"]); assert.equal(f.g.standDown(), true)
  group.remove(); await settle()
  assert.equal(f.g.standDown(), false, "the group going away brings ours back")

  const button = f.d.createElement("button"); button.setAttribute("data-action", "home-session-archive")
  const row = f.d.createElement("div"); row.setAttribute("data-component", "home-session-row-container"); row.append(button)
  f.d.body.append(row); f.setPath("/home"); await settle()
  assert.deepEqual(f.g.reasons(), ["home"])
  f.d.body.removeChild(row); f.setPath("/s/1"); await settle()
  assert.equal(f.g.standDown(), true, "Home unmounted: the last reading stands")
  const bare = f.d.createElement("div"); bare.setAttribute("data-component", "home-session-row-container")
  f.d.body.append(bare); f.setPath("/"); await settle()
  assert.equal(f.g.standDown(), false, "Home visible without the button clears it")
  f.g.dispose()
})

test("guard: a host group present at load stands down at once; our own group never counts", () => {
  const f = guard(HOST_GROUP, "auto"); assert.equal(f.g.standDown(), true); f.g.dispose()
  const o = guard(OURS, "auto"); assert.equal(o.g.standDown(), false); o.g.dispose()
})

test("guard: ours and theirs ignore detection and do not probe the DOM", async () => {
  const ours = guard(HOST_GROUP, "ours", ["session.archive"]); ours.g.menu(true)
  assert.equal(ours.g.standDown(), false); assert.deepEqual(ours.g.reasons(), [])
  const theirs = guard(NONE, "theirs")
  assert.equal(theirs.g.standDown(), true)
  ours.g.dispose(); theirs.g.dispose()
})
