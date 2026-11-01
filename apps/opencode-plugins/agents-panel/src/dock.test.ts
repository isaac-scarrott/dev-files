import assert from "node:assert/strict"
import { test } from "node:test"
import { dockState, DOCK_INSET, DOCK_WIDTH } from "./dock"

const base = { enabled: true, sideOpen: false, narrow: false, visible: true }

test("dockState: the window exists only while enabled, the right panel is closed and the window is wide enough", () => {
  assert.deepEqual(dockState(base), { docked: true, shown: true, inset: DOCK_WIDTH + DOCK_INSET })
  assert.deepEqual(dockState({ ...base, visible: false }), { docked: true, shown: false, inset: 0 })
  assert.deepEqual(dockState({ ...base, sideOpen: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ ...base, narrow: true }), { docked: false, shown: false, inset: 0 })
  assert.deepEqual(dockState({ ...base, enabled: false }), { docked: false, shown: false, inset: 0 })
})
