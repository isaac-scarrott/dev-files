import assert from "node:assert/strict"
import { test } from "node:test"
import { dockState, DOCK_GAP, DOCK_WIDTH } from "./dock"

test("dockState: the window only exists while enabled and the sidebar is open; the choice is kept", () => {
  assert.deepEqual(dockState({ enabled: true, sidebarOpen: true, visible: true }), { docked: true, shown: true, inset: DOCK_WIDTH + DOCK_GAP })
  assert.deepEqual(dockState({ enabled: true, sidebarOpen: true, visible: false }), { docked: true, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: true, sidebarOpen: false, visible: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: false, sidebarOpen: true, visible: true }), { docked: false, shown: false, inset: 0 })
})
