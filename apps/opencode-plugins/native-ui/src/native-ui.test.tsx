import { test } from "node:test"
import assert from "node:assert/strict"
import { Window } from "happy-dom"
import { render } from "solid-js/web"
import { createSignal } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import { SessionTabRow, hasSidebarRepos } from "./session-tab-row"
import { MenuContent, MenuItem, MenuSeparator } from "./menu"
import { Popover } from "./popover"
import { attachTabRowAction, TabRowAction } from "./tab-row-action"
import { createHost } from "./host"
import { ProjectAvatar, first } from "./project-avatar"

// Stand-ins for the two ctx.ui components the library renders; the real ones carry the same attributes.
const ui = {
  IconButton: (props: any) => {
    const el = document.createElement("button")
    el.type = "button"
    el.dataset.component = "icon-button-v2"
    el.dataset.size = props.size ?? "normal"
    el.dataset.variant = props.variant ?? "ghost"
    if (props.class) el.className = props.class
    el.setAttribute("aria-label", props.label)
    if (props.pressed) el.setAttribute("aria-pressed", "true")
    el.onclick = (event) => props.onClick?.(event)
    return el as any
  },
  Tooltip: (props: any) => props.children,
} as unknown as Ui

// Solid delegates events to the document it loaded with (test/register.mjs), so every test reuses it.
function dom() {
  const window = (globalThis as any).window as Window
  Object.assign(globalThis, { HTMLElement: window.HTMLElement, HTMLButtonElement: window.HTMLButtonElement, Node: window.Node, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, PointerEvent: window.PointerEvent, DragEvent: window.DragEvent, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0) })
  const doc = window.document as unknown as Document
  doc.head.innerHTML = ""
  doc.body.innerHTML = ""
  return doc
}

const mouse = (type: string, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
const key = (k: string) => new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })

test("SessionTabRow copies the host's slot, trigger and row markup and opens like a live tab", () => {
  const doc = dom()
  const host = doc.createElement("div")
  doc.body.append(host)
  let opened = 0
  let middle = 0
  render(() => <SessionTabRow ui={ui} title="Seeded long session" project="dev-files · master" onOpen={() => opened++} onMiddleClick={() => middle++} />, host)
  const slot = host.querySelector("[data-titlebar-tab-slot]")!
  assert.equal(slot.getAttribute("data-orientation"), "vertical")
  assert.ok(slot.querySelector(":scope > [data-component=session-tab-popover-trigger][tabindex='-1'] > [data-titlebar-tab][data-slot=titlebar-tab-item][data-orientation=vertical]"))
  assert.equal(slot.querySelector("[data-tab-key]"), null)
  const link = host.querySelector<HTMLAnchorElement>("[data-slot=tab-link][data-titlebar-tab-link]")!
  assert.equal(link.getAttribute("draggable"), "false")
  assert.equal(link.querySelector("[data-slot=project-avatar-slot] [data-component=project-avatar-v2]")?.textContent, "S")
  assert.equal(host.querySelector("[data-slot=tab-title]")?.textContent, "Seeded long session")
  assert.equal(host.querySelector("[data-sidebar-repo]"), null, "no second line until sidebar-repos' Style is present")
  assert.ok(host.querySelector("[data-titlebar-tab] > [data-slot=tab-close] > [data-slot=tab-status]"))

  link.dispatchEvent(mouse("mousedown", { button: 0 }))
  assert.equal(opened, 1, "navigates on primary mousedown")
  link.dispatchEvent(mouse("mousedown", { button: 2 }))
  assert.equal(opened, 1)
  const click = mouse("click", { detail: 1 })
  link.dispatchEvent(click)
  assert.equal(opened, 1, "a mouse click after mousedown does not open twice")
  assert.ok(click.defaultPrevented)
  link.dispatchEvent(mouse("click", { detail: 0 }))
  assert.equal(opened, 2, "keyboard activation (detail 0) opens")
  const drag = new DragEvent("dragstart", { bubbles: true, cancelable: true })
  link.dispatchEvent(drag)
  assert.ok(drag.defaultPrevented)
  host.querySelector("[data-titlebar-tab]")!.dispatchEvent(mouse("auxclick", { button: 1 }))
  assert.equal(middle, 1)
})

test("SessionTabRow shows the second line only when sidebar-repos styles it", () => {
  const doc = dom()
  const style = doc.createElement("style")
  style.dataset.plugin = "sidebar-repos"
  doc.head.append(style)
  assert.ok(hasSidebarRepos(doc))
  const host = doc.createElement("div")
  doc.body.append(host)
  render(() => <SessionTabRow ui={ui} title="t" project="dev-files · master" detail="9:00" />, host)
  const link = host.querySelector("[data-slot=tab-link]")!
  const badge = link.querySelector("[data-sidebar-repo]")!
  assert.equal(badge.textContent, "dev-files · master · 9:00")
  assert.equal(badge.getAttribute("title"), "dev-files · master · 9:00")
  assert.equal(badge.nextElementSibling?.getAttribute("data-slot"), "tab-title", "badge sits before the title, where sidebar-repos puts it")
  assert.equal(host.querySelector("[data-slot=tab-link]")!.getAttribute("tabindex"), null, "the link carries no tabindex, as the host's does; its href makes it a tab stop")
})

test("MenuContent roves with the arrow keys, selects with Enter and closes with Escape", async () => {
  const doc = dom()
  const host = doc.createElement("div")
  doc.body.append(host)
  const picked: string[] = []
  let closed = 0
  render(() => (
    <MenuContent label="Row actions" autofocus onClose={() => closed++}>
      <MenuItem onSelect={() => picked.push("rename")}>Rename</MenuItem>
      <MenuItem onSelect={() => picked.push("snooze")} submenu>Snooze</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => picked.push("gone")} disabled>Gone</MenuItem>
      <MenuItem onSelect={() => picked.push("delete")} variant="critical" shortcut="⌘⌫">Delete…</MenuItem>
    </MenuContent>
  ), host)
  const menu = host.querySelector<HTMLElement>("[role=menu][data-component=menu-v2-content][data-appearance=compact]")!
  const items = Array.from(menu.querySelectorAll<HTMLElement>("[role=menuitem]"))
  assert.equal(items.length, 4)
  assert.ok(menu.querySelector("hr[data-slot=menu-v2-separator][data-orientation=horizontal]"))
  assert.equal(items[1].getAttribute("aria-haspopup"), "true")
  assert.ok(items[1].querySelector("[data-slot=menu-v2-item-chevron]"))
  assert.equal(items[2].getAttribute("aria-disabled"), "true")
  assert.equal(items[3].dataset.variant, "critical")
  assert.equal(items[3].querySelector("[data-slot=menu-v2-item-shortcut]")?.textContent, "⌘⌫")
  assert.ok(items[0].hasAttribute("data-highlighted"), "autofocus highlights the first item")
  assert.equal(doc.activeElement, items[0])

  items[0].dispatchEvent(key("ArrowDown"))
  assert.equal(doc.activeElement, items[1])
  items[1].dispatchEvent(key("ArrowDown"))
  assert.equal(doc.activeElement, items[3], "disabled items are skipped")
  items[3].dispatchEvent(key("ArrowDown"))
  assert.equal(doc.activeElement, items[0], "wraps")
  items[0].dispatchEvent(key("End"))
  assert.equal(doc.activeElement, items[3])
  items[3].dispatchEvent(key("Home"))
  assert.equal(doc.activeElement, items[0])
  assert.equal(menu.querySelectorAll("[data-highlighted]").length, 1)
  items[0].dispatchEvent(key("Enter"))
  assert.deepEqual(picked, ["rename"])
  items[2].dispatchEvent(mouse("click"))
  assert.deepEqual(picked, ["rename"], "disabled items ignore clicks")
  items[1].dispatchEvent(key("ArrowRight"))
  assert.deepEqual(picked, ["rename", "snooze"], "ArrowRight opens a submenu trigger")
  menu.dispatchEvent(key("Escape"))
  assert.equal(closed, 1)
})

test("Popover closes on Escape and outside press and hands focus back", async () => {
  const doc = dom()
  const trigger = doc.createElement("button")
  const host = doc.createElement("div")
  doc.body.append(trigger, host)
  trigger.focus()
  const [open, setOpen] = createSignal(true)
  let closes = 0
  render(() => <>{open() && <Popover anchor={trigger} label="Agents" onClose={() => { closes++; setOpen(false) }}><button>inside</button></Popover>}</>, host)
  const card = doc.querySelector<HTMLElement>("body > div > [role=dialog][data-component=popover-shell]")! // portalled into <body>, as Kobalte does
  assert.ok(card.querySelector(":scope > [data-component=session-summary-panel] > button"), "children sit in the host's summary panel")
  assert.equal(card.style.position, "fixed")
  assert.equal(doc.activeElement, card, "pointer opens focus the card")
  card.querySelector("button")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
  assert.equal(closes, 0, "presses inside stay open")
  card.dispatchEvent(key("Escape"))
  assert.equal(closes, 1)
  assert.equal(doc.querySelector("[role=dialog]"), null)
  assert.equal(doc.activeElement, trigger, "focus returns to the trigger")
  setOpen(true)
  doc.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
  assert.equal(closes, 2, "an outside press closes")
})

test("attachTabRowAction sits before the host's close slot and the replace variant marks itself", () => {
  const doc = dom()
  const tab = doc.createElement("div")
  tab.setAttribute("data-titlebar-tab", "")
  const close = doc.createElement("div")
  close.dataset.slot = "tab-close"
  tab.append(close)
  doc.body.append(tab)
  let clicks = 0
  const dispose = attachTabRowAction(tab, createHost(ui), { icon: "xmark-small", label: "Snooze", onClick: () => clicks++ })
  const action = tab.querySelector<HTMLElement>("[data-slot=tab-row-action]")!
  assert.equal(action.nextElementSibling, close)
  const button = action.querySelector<HTMLButtonElement>("button[data-component=icon-button-v2][data-size=small][data-variant=ghost-muted]")!
  assert.equal(button.className, "hover-reveal relative z-10")
  assert.equal(button.getAttribute("aria-label"), "Snooze")
  const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true })
  button.dispatchEvent(down)
  assert.ok(down.defaultPrevented, "the press neither navigates the row nor starts a drag")
  const click = mouse("click")
  button.dispatchEvent(click)
  assert.equal(clicks, 1)
  assert.ok(click.defaultPrevented)
  dispose()
  assert.equal(tab.querySelector("[data-slot=tab-row-action]"), null)

  const host = doc.createElement("div")
  render(() => <TabRowAction ui={ui} icon="archive" label="Archive" replace onClick={() => {}} />, host)
  assert.ok(host.querySelector("[data-slot=tab-row-action][data-replace]"))
})

test("ProjectAvatar letters the first grapheme and marks images", () => {
  const doc = dom()
  const host = doc.createElement("div")
  render(() => <><ProjectAvatar fallback="👩‍💻 team" variant="blue" /><ProjectAvatar fallback="x" src="a.png" unread /></>, host)
  const [a, b] = Array.from(host.querySelectorAll("[data-component=project-avatar-v2]"))
  assert.equal(first("👩‍💻 team"), "👩‍💻")
  assert.equal(a.querySelector("[data-slot=project-avatar-surface][data-variant=blue]")?.textContent, "👩‍💻")
  assert.ok(b.querySelector("[data-slot=project-avatar-surface][data-has-image] > img[data-slot=project-avatar-image]"))
  assert.ok(b.hasAttribute("data-unread"))
  assert.ok(b.querySelector("[data-slot=project-avatar-unread-dot]"))
})
