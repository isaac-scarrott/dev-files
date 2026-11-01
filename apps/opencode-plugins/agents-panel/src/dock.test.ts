import assert from "node:assert/strict"
import { test } from "node:test"
import { dockState, DOCK_INSET, DOCK_WIDTH, readSidebar, readSidebarFacts } from "./dock"

test("dockState: the window exists only while enabled and the sidebar is closed; open or top tabs is popover mode", () => {
  assert.deepEqual(dockState({ enabled: true, sidebar: "closed", visible: true }), { docked: true, shown: true, inset: DOCK_WIDTH + DOCK_INSET })
  assert.deepEqual(dockState({ enabled: true, sidebar: "closed", visible: false }), { docked: true, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: true, sidebar: "open", visible: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: true, sidebar: "none", visible: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: false, sidebar: "closed", visible: true }), { docked: false, shown: false, inset: 0 })
})

test("readSidebar: open and closed as the host renders them; any other value is closed; no aside or no attribute is none", () => {
  const read = (html: string) => {
    const root = document.createElement("div")
    root.innerHTML = html
    return readSidebar(root)
  }
  assert.equal(read('<aside data-slot="vertical-tabs-sidebar" data-state="open"></aside>'), "open")
  assert.equal(read('<aside data-slot="vertical-tabs-sidebar" data-state="closed" data-peek=""></aside>'), "closed")
  assert.equal(read('<aside data-slot="vertical-tabs-sidebar" data-state="collapsed"></aside>'), "closed")
  assert.equal(read('<aside data-slot="vertical-tabs-sidebar"></aside>'), "none")
  assert.equal(read('<div data-state="closed"></div>'), "none")
})

// The real shape from the 2.2.5 app: attributes as the host writes them plus the rect it lays out. A collapsed aside is
// width 0 (its mount slides to x=-276 inside it), an open one 276 wide. Happy-dom lays nothing out, so the rect is stubbed.
const aside = (state: string, rect: { x: number; width: number; height?: number }, style = "") => {
  const root = document.createElement("div")
  root.innerHTML = `<aside id="vertical-tabs-sidebar" data-slot="vertical-tabs-sidebar" data-state="${state}" style="--sidebar-peek-width: 276px; width: ${rect.width}px;${style}"></aside>`
  document.body.append(root) // computed style needs the element in the document
  const el = root.firstElementChild!
  el.getBoundingClientRect = () => ({ x: rect.x, left: rect.x, right: rect.x + rect.width, top: 0, bottom: 1014, width: rect.width, height: rect.height ?? 1014, y: 0, toJSON() {} }) as DOMRect
  return root
}

test("readSidebarFacts: follows what is visible: open at 276, closed at 0, and a mismatched attribute loses to the rect", () => {
  assert.deepEqual(readSidebarFacts(aside("open", { x: 0, width: 276 })), { sidebar: "open", width: 276 })
  assert.deepEqual(readSidebarFacts(aside("closed", { x: 0, width: 0 })), { sidebar: "closed", width: 0 })
  assert.equal(readSidebarFacts(aside("open", { x: 0, width: 0 })).sidebar, "closed", "open attribute, zero width")
  assert.equal(readSidebarFacts(aside("open", { x: -300, width: 276 })).sidebar, "closed", "open attribute, off-screen")
  assert.equal(readSidebarFacts(aside("open", { x: 0, width: 276 }, "visibility:hidden")).sidebar, "closed", "open attribute, hidden")
  assert.equal(readSidebarFacts(aside("open", { x: 0, width: 276 }, "display:none")).sidebar, "closed", "open attribute, display none")
  assert.equal(readSidebarFacts(aside("closed", { x: 0, width: 276 })).sidebar, "closed", "closed attribute wins while the rect is still wide")
  document.body.innerHTML = ""
})
