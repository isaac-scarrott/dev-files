import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createKeyGuard } from "./keys"

function host(visible: string[], focused?: string) {
  const window = new Window()
  const doc = window.document as unknown as Document
  const pressed: string[] = []
  let handled = 0
  const guard = createKeyGuard({
    visible: () => visible,
    focused: () => focused,
    focus: (key) => void pressed.push(key),
    handled: () => void (handled += 1),
    lost: () => undefined,
  })
  const detach = guard.attach(doc)
  const key = (init: KeyboardEventInit) => {
    const event = new (window.KeyboardEvent as unknown as typeof KeyboardEvent)("keydown", { bubbles: true, cancelable: true, ...init })
    doc.body.dispatchEvent(event)
    return { defaultPrevented: event.defaultPrevented, pressed, handled }
  }
  return { key, detach, pressed, window, doc }
}

test("Alt+ArrowDown walks only the rows on screen, wrapping", () => {
  const { key } = host(["a", "b"], "a")
  const result = key({ key: "ArrowDown", altKey: true })
  assert.deepEqual(result.pressed, ["b"])
  assert.equal(result.defaultPrevented, true, "the host never sees it")
  assert.equal(result.handled, 1)
})

test("moving past the last visible row wraps to the first, and back", () => {
  assert.deepEqual(host(["a", "b"], "b").key({ key: "ArrowDown", altKey: true }).pressed, ["a"])
  assert.deepEqual(host(["a", "b"], "a").key({ key: "ArrowUp", altKey: true }).pressed, ["b"])
})

test("Mod+2 goes to the second row on screen, not the second tab overall", () => {
  const { key } = host(["x", "y", "z"], "x")
  const result = key({ key: "2", metaKey: true })
  assert.deepEqual(result.pressed, ["y"])
  assert.equal(result.defaultPrevented, true)
})

test("a digit past the visible rows is left to the host", () => {
  const { key } = host(["x"], "x")
  const result = key({ key: "5", metaKey: true })
  assert.deepEqual(result.pressed, [])
  assert.equal(result.defaultPrevented, false)
})

test("a text field keeps its own keys", () => {
  const { key, doc } = host(["a", "b"], "a")
  const input = doc.createElement("input")
  doc.body.append(input)
  input.focus()
  const event = new (doc.defaultView!.KeyboardEvent as unknown as typeof KeyboardEvent)("keydown", { key: "2", metaKey: true, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  assert.equal(event.defaultPrevented, false)
})

test("keys we do not own are untouched", () => {
  const { key } = host(["a", "b"], "a")
  for (const init of [{ key: "ArrowDown" }, { key: "2" }, { key: "k", metaKey: true }, { key: "ArrowDown", altKey: true, metaKey: true }]) {
    assert.equal(key(init).defaultPrevented, false, JSON.stringify(init))
  }
})

test("with nothing visible nothing is consumed", () => {
  const { key } = host([], undefined)
  assert.equal(key({ key: "ArrowDown", altKey: true }).defaultPrevented, false)
})

test("detaching stops the guard", () => {
  const { key, detach } = host(["a", "b"], "a")
  detach()
  assert.equal(key({ key: "ArrowDown", altKey: true }).defaultPrevented, false)
})
