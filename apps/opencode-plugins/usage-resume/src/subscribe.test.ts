import assert from "node:assert/strict"
import test from "node:test"
import { createKeyed } from "@opencode/plugin/gui"
import { createRoot, createSignal, onCleanup } from "solid-js"

// The server `changed` subscription in gui.tsx: one listener per rpc client, released with the owner.
test("changed subscription: one listener, released on dispose, replaced when the rpc client changes", () => {
  const live = new Set<number>()
  let next = 0
  const client = () => ({ events: { on: (_name: string, _fn: () => void) => { const id = ++next; live.add(id); return () => void live.delete(id) } } })
  const [rpc, setRpc] = createSignal(client())
  const dispose = createRoot((stop) => {
    createKeyed(rpc, (current) => { onCleanup(current.events.on("changed", () => {})) })
    return stop
  })
  assert.equal(live.size, 1)
  setRpc(client())
  assert.equal(live.size, 1)
  assert.equal(next, 2)
  dispose()
  assert.equal(live.size, 0)
})
