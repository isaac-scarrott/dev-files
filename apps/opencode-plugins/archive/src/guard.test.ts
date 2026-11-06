import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { Window } from "happy-dom"
import { withHub } from "../../session-ui/src/testui"
import { createGuard, hasNativeArchive, parseArchiveOption, probeHome, probeSidebar, reasonsOf, actionsStandDown, groupStandsDown, type Signals } from "./guard"

const doc = (html: string) => { const w = new Window(); w.document.body.innerHTML = html; return w.document as unknown as Document }
const none: Signals = { menu: false, home: false, sidebar: false }

// The three states, as shapes the detector reads. `NONE` is the 2.2.5 vertical sidebar (app/src/shell/titlebar/tab-strip.tsx, shell.tsx).
const NONE = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="a" data-titlebar-tab></div></div></div><div data-slot="vertical-tabs-footer"></div></aside>`
const HOST_GROUP = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-tab-key="a"></div><section data-slot="vertical-tabs-archived"><button aria-expanded="false">Archived</button></section></div></div></aside>`
// The experimental Inbox layout of 2.2.5: its own Archived section and Archive menu item, in a different sidebar.
const INBOX = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="sidebar-inbox"><div data-slot="sidebar-inbox-scroll"><div class="h-6">Archived</div><div data-slot="sidebar-inbox-item"></div></div></div></aside>`
const OURS = `<aside data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><div data-sa-groups><section data-sa-group="archived"><div data-sa-contents data-sa-kind="archived" id="sa-group-archived"><div data-slot="archived-row"></div></div></section></div></div></div></aside>`
const MENU = (...items: string[]) => `<div role="menu" data-component="menu-v2-content">${items.join("")}</div>`
const ITEM = (label: string, attrs = "") => `<div role="menuitem" ${attrs}><span>${label}</span></div>`

test("the option reads auto, ours, theirs; anything else is auto", () => {
  assert.deepEqual([undefined, "auto", "ours", "theirs", "THEIRS", 1, null, {}].map(parseArchiveOption), ["auto", "auto", "ours", "theirs", "auto", "auto", "auto", "auto"])
})

test("stand-down: the group yields to a host archived group only, the actions to any host archive UI; ours never, theirs always", () => {
  assert.deepEqual(reasonsOf({ ...none, home: true, sidebar: true }), ["home", "sidebar"])
  for (const reason of Object.keys(none) as (keyof Signals)[]) {
    assert.equal(actionsStandDown("auto", { ...none, [reason]: true }), true, reason)
    assert.equal(groupStandsDown("auto", { ...none, [reason]: true }), reason === "sidebar", reason)
    assert.equal(actionsStandDown("ours", { ...none, [reason]: true }), false, reason)
    assert.equal(groupStandsDown("ours", { ...none, [reason]: true }), false, reason)
  }
  for (const stand of [actionsStandDown, groupStandsDown]) {
    assert.equal(stand("auto", none), false)
    assert.equal(stand("theirs", none), true)
    assert.equal(stand("ours", none), false)
  }
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

// Captured from the 2.2.5 harness (Side tabs), with this plugin's items already added: the tab menu and the Home row menu.
// Neither host menu has an Archive item, so the Archive entries below are ours and must not count.
const item = (label: string, attrs: string) => `<div role="menuitem" data-component="menu-v2-item" data-appearance="compact" tabindex="-1" ${attrs}><span data-slot="menu-v2-item-content">${label}</span></div>`
const REAL_TAB_MENU = `<div data-expanded="" role="menu" data-component="menu-v2-content" data-appearance="compact">${item("Rename", 'aria-disabled="false" data-key="contextmenu-cl-105-item-cl-172"')}${item("Close tab", 'data-key="contextmenu-cl-105-item-cl-173"')}${item("Snooze", 'data-sa-menu="" aria-haspopup="true" aria-expanded="false"')}${item("Archive", 'data-sa-menu=""')}<hr data-orientation="horizontal" data-slot="menu-v2-separator" data-appearance="compact">${item("Delete session…", 'data-variant="critical" data-key="contextmenu-cl-105-item-cl-174"')}</div>`
const REAL_HOME_MENU = `<div data-expanded="" role="menu" data-component="menu-v2-content" data-appearance="compact">${item("Rename", 'data-key="dropdownmenu-cl-183-item-cl-187"')}${item("Export…", 'data-key="dropdownmenu-cl-183-item-cl-188"')}${item("Snooze", 'data-sa-menu=""')}${item("Archive", 'data-sa-menu=""')}<hr data-orientation="horizontal" data-slot="menu-v2-separator" data-appearance="compact">${item("Delete…", 'data-key="dropdownmenu-cl-183-item-cl-189"')}</div>`

test("menu probe: the real 2.2.5 tab and Home row menus read none; a host Archive item added to them reads present", () => {
  for (const html of [REAL_TAB_MENU, REAL_HOME_MENU]) {
    assert.equal(hasNativeArchive(doc(html)), false)
    assert.equal(hasNativeArchive(doc(html.replace(/(<hr)/, `${item("Archive", "")}$1`))), true)
  }
})

const guard = (html: string, option: "auto" | "ours" | "theirs") => {
  const d = doc(html)
  const [path, setPath] = createSignal("/")
  const rig = withHub(d, (hub) => createGuard({ doc: d, option, path, hub }), function (this: unknown, fn) { assert.equal(this, undefined, "called bare, as the browser's requestAnimationFrame needs"); queueMicrotask(fn); return 1 })
  const g = Object.assign(rig.value, { dispose: rig.stop })
  return { g, d, setPath }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

test("guard: none stays ours; a host menu item, sidebar group or Home button each stand something down, and each reverses", async () => {
  const f = guard(NONE, "auto")
  assert.equal(f.g.groupDown(), false); assert.equal(f.g.actionsDown(), false)
  assert.deepEqual(f.g.reasons(), [])

  // An Archive action in a host menu is not a way to browse archived sessions: our Archive actions yield, our group stays.
  f.g.menu(true); assert.deepEqual(f.g.reasons(), ["menu"]); assert.equal(f.g.actionsDown(), true); assert.equal(f.g.groupDown(), false)
  f.g.menu(false); assert.equal(f.g.actionsDown(), false)

  const scroll = f.d.querySelector('[data-slot="vertical-tabs-scroll"]')!
  const group = f.d.createElement("section"); group.setAttribute("data-slot", "vertical-tabs-archived")
  scroll.append(group); await settle()
  assert.deepEqual(f.g.reasons(), ["sidebar"]); assert.equal(f.g.groupDown(), true); assert.equal(f.g.actionsDown(), true)
  group.remove(); await settle()
  assert.equal(f.g.groupDown(), false, "the group going away brings ours back"); assert.equal(f.g.actionsDown(), false)

  const button = f.d.createElement("button"); button.setAttribute("data-action", "home-session-archive")
  const row = f.d.createElement("div"); row.setAttribute("data-component", "home-session-row-container"); row.append(button)
  f.d.body.append(row); f.setPath("/home"); await settle()
  assert.deepEqual(f.g.reasons(), ["home"]); assert.equal(f.g.actionsDown(), true); assert.equal(f.g.groupDown(), false)
  f.d.body.removeChild(row); f.setPath("/s/1"); await settle()
  assert.equal(f.g.actionsDown(), true, "Home unmounted: the last reading stands")
  const bare = f.d.createElement("div"); bare.setAttribute("data-component", "home-session-row-container")
  f.d.body.append(bare); f.setPath("/"); await settle()
  assert.equal(f.g.actionsDown(), false, "Home visible without the button clears it")
  f.g.dispose()
})

test("guard: a host group present at load stands down at once; our own group never counts", () => {
  const f = guard(HOST_GROUP, "auto"); assert.equal(f.g.groupDown(), true); f.g.dispose()
  const o = guard(OURS, "auto"); assert.equal(o.g.groupDown(), false); assert.equal(o.g.actionsDown(), false); o.g.dispose()
})

test("guard: ours and theirs ignore detection and do not probe the DOM", async () => {
  const ours = guard(HOST_GROUP, "ours"); ours.g.menu(true)
  assert.equal(ours.g.groupDown(), false); assert.equal(ours.g.actionsDown(), false); assert.deepEqual(ours.g.reasons(), [])
  const theirs = guard(NONE, "theirs")
  assert.equal(theirs.g.groupDown(), true); assert.equal(theirs.g.actionsDown(), true)
  ours.g.dispose(); theirs.g.dispose()
})
