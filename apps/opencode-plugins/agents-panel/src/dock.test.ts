import assert from "node:assert/strict"
import { test } from "node:test"
import { dockState, DOCK_INSET, DOCK_WIDTH, readSidebar } from "./dock"

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
