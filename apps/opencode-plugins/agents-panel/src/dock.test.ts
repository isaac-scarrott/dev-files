import assert from "node:assert/strict"
import { test } from "node:test"
import { dockState, DOCK_INSET, DOCK_WIDTH } from "./dock"

test("dockState: the window exists only while enabled and the sidebar is closed; open or top tabs is popover mode", () => {
  assert.deepEqual(dockState({ enabled: true, sidebar: "closed", visible: true }), { docked: true, shown: true, inset: DOCK_WIDTH + DOCK_INSET })
  assert.deepEqual(dockState({ enabled: true, sidebar: "closed", visible: false }), { docked: true, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: true, sidebar: "open", visible: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: true, sidebar: "none", visible: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ enabled: false, sidebar: "closed", visible: true }), { docked: false, shown: false, inset: 0 })
})
