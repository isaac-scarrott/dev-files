import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createSpaceMenus, extendNative, hasDelete, OWNER } from "./menus"

/** A host session menu as the app renders one: items, then a separator and Delete… last. */
function nativeMenu() {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<div role="menu" data-component="menu-v2-content" data-appearance="compact">
    <div role="menuitem" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">Rename</span></div>
    <div role="menuitem" data-component="menu-v2-item"><span data-slot="menu-v2-item-content">Close tab</span></div>
    <div role="separator" data-slot="menu-v2-separator"></div>
    <div role="menuitem" data-component="menu-v2-item" data-variant="critical"><span data-slot="menu-v2-item-content">Delete session…</span></div>
  </div>`
  return { doc, window, content: doc.querySelector<HTMLElement>('[role="menu"]')! }
}

const labels = (content: HTMLElement) =>
  [...content.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]')].map((el) => el.querySelector('[data-slot="menu-v2-item-content"]')?.textContent)

test("a session menu is recognised by its trailing Delete…, a menu that is not one is left alone", () => {
  const { doc, content } = nativeMenu()
  assert.equal(hasDelete(content), true)
  doc.body.innerHTML = '<div role="menu"><div role="menuitem">Edit</div></div>'
  assert.equal(hasDelete(doc.querySelector<HTMLElement>('[role="menu"]')!), false)
  doc.body.innerHTML = '<div role="menu"><div role="menuitem">Edit</div><div role="separator"></div><div role="menuitem">Delete</div></div>'
  assert.equal(hasDelete(doc.querySelector<HTMLElement>('[role="menu"]')!), true, "a separator before the last item is enough")
})

test("our lines land above the separator that precedes Delete…", () => {
  const { content } = nativeMenu()
  extendNative(content, [{ label: "Move to space", run: () => undefined }])
  assert.deepEqual(labels(content), ["Rename", "Close tab", "Move to space", "Delete session…"])
  const ours = content.querySelector<HTMLElement>(`[${OWNER}]`)!
  assert.equal(ours.nextElementSibling?.getAttribute("data-slot"), "menu-v2-separator", "the host's separator stays before Delete…")
})

test("a submenu lists the spaces and disables the one the session is already in", () => {
  const { content, doc } = nativeMenu()
  const moved: string[] = []
  extendNative(content, [{
    label: "Move to space",
    submenu: () => [
      { label: "🌱  Sessions", disabled: true, run: () => undefined },
      { label: "🌿  Work", run: () => void moved.push("Work") },
    ],
    run: () => undefined,
  }])
  const trigger = content.querySelector<HTMLElement>(`[${OWNER}][aria-haspopup]`)!
  assert.equal(trigger.getAttribute("aria-expanded"), "false")
  trigger.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  const sub = content.querySelector<HTMLElement>('[role="menu"][data-spaces-sub]')!
  assert.ok(sub, "the submenu opens inside the parent menu")
  assert.deepEqual([...sub.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((el) => el.getAttribute("aria-disabled")), ["true", null])
  const work = [...sub.querySelectorAll<HTMLElement>('[role="menuitem"]')][1]!
  work.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      assert.deepEqual(moved, ["Work"])
      resolve()
    }, 20),
  )
})

test("extending twice keeps one set, and the undo removes only ours", () => {
  const { content } = nativeMenu()
  const undo = extendNative(content, [{ label: "Move to space", run: () => undefined }])
  extendNative(content, [{ label: "Move to space", run: () => undefined }])
  assert.equal(content.querySelectorAll(`[${OWNER}]`).length, 1)
  undo()
  assert.equal(content.querySelectorAll(`[${OWNER}]`).length, 0)
  assert.deepEqual(labels(content), ["Rename", "Close tab", "Delete session…"], "the host's own items survive")
})

test("the tab menu finds its session from the row the click came from", () => {
  const { doc, content } = nativeMenu()
  const row = doc.createElement("div")
  row.setAttribute("data-tab-key", "s\n/x")
  doc.body.append(row)
  const seen: string[] = []
  const menus = createSpaceMenus(doc, (session) => {
    seen.push(`${session.server}/${session.id}`)
    return []
  }, {
    tab: (key) => (key.startsWith("s\n") ? { server: "s", id: "A" } : undefined),
    row: () => undefined,
    current: () => undefined,
  })
  // A press on the row is what the host records before it opens the menu.
  row.dispatchEvent(new (doc.defaultView!.MouseEvent)("pointerdown", { bubbles: true }))
  menus.inspect(content)
  menus.stop()
  assert.deepEqual(seen, ["s/A"])
})

test("what the read function returns nothing for is left completely alone", () => {
  const { doc, content } = nativeMenu()
  const row = doc.createElement("div")
  row.setAttribute("data-tab-key", "k")
  doc.body.append(row)
  const menus = createSpaceMenus(doc, () => [], { tab: () => ({ server: "s", id: "A" }), row: () => undefined, current: () => undefined })
  row.dispatchEvent(new (doc.defaultView!.MouseEvent)("pointerdown", { bubbles: true }))
  menus.inspect(content)
  menus.stop()
  assert.equal(content.querySelectorAll(`[${OWNER}]`).length, 0)
})
