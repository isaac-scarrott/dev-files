import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createStrip, DOT, STRIP } from "./strip"

const plain = () => undefined

/** The sidebar as the host renders it: a mount whose first child is the flex column holding the list and the footer. */
function host() {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `
    <div data-slot="vertical-tabs-mount">
      <div class="flex size-full flex-col">
        <div data-slot="vertical-tabs">
          <div data-slot="vertical-tabs-scroll">
            <div data-tab-key="a"></div>
            <div data-tab-key="b"></div>
          </div>
        </div>
        <div data-slot="vertical-tabs-footer"></div>
      </div>
    </div>`
  return { doc, window }
}

const spaces = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `sp_${index}`, name: `Space ${index + 1}`, emoji: "🌱" }))

test("the strip lands in the sidebar column, just before its footer", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  assert.equal(strip.place(), true)
  const element = doc.querySelector(`[${STRIP}]`)!
  assert.equal(element.parentElement?.getAttribute("class"), "flex size-full flex-col")
  assert.equal(element.nextElementSibling?.getAttribute("data-slot"), "vertical-tabs-footer")
})

test("one space shows nothing, two show a dot each with the active one marked", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  strip.place()
  const element = doc.querySelector<HTMLElement>(`[${STRIP}]`)!
  strip.update(spaces(1), 0)
  assert.ok(element.hasAttribute("data-spaces-empty"), "hidden with one space")
  strip.update(spaces(2), 1)
  assert.ok(!element.hasAttribute("data-spaces-empty"))
  const dots = [...element.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  assert.equal(dots.length, 2)
  assert.equal(dots[0]!.getAttribute("aria-selected"), "false")
  assert.equal(dots[1]!.getAttribute("aria-selected"), "true")
  assert.equal(dots[1]!.textContent, "🌱")
  assert.equal(dots[1]!.getAttribute("title"), "Space 2")
})

test("clicking a dot reports its index, and clicks do not reach the host", () => {
  const { doc } = host()
  const picked: number[] = []
  const strip = createStrip(doc, { select: (index) => void picked.push(index), reorder: plain }, plain)
  strip.place()
  strip.update(spaces(3), 0)
  const dots = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  dots[2]!.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  assert.deepEqual(picked, [2])
})

test("dragging a dot two slots right asks for that reorder, and does not also switch space", () => {
  const { doc } = host()
  const picked: number[] = []
  const moved: [number, number][] = []
  const strip = createStrip(doc, { select: (index) => void picked.push(index), reorder: (from, to) => void moved.push([from, to]) }, plain)
  strip.place()
  strip.update(spaces(4), 0)
  const dots = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  const dot = dots[0]!
  const Pointer = doc.defaultView!.PointerEvent as unknown as typeof PointerEvent
  dot.setPointerCapture = () => undefined
  dot.dispatchEvent(new Pointer("pointerdown", { bubbles: true, clientX: 100, clientY: 10, button: 0, pointerId: 1 }))
  dot.dispatchEvent(new Pointer("pointermove", { bubbles: true, clientX: 130, clientY: 10, pointerId: 1 }))
  dot.dispatchEvent(new Pointer("pointerup", { bubbles: true, clientX: 148, clientY: 10, pointerId: 1 }))
  assert.deepEqual(moved, [[0, 2]])
  dot.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  assert.deepEqual(picked, [], "the click that ends a drag is swallowed")
})

test("the row moves while dragging: dots the pointer passes slide into the slot it left", () => {
  const { doc } = host()
  const moved: [number, number][] = []
  const strip = createStrip(doc, { select: plain, reorder: (from, to) => void moved.push([from, to]) }, plain)
  strip.place()
  strip.update(spaces(4), 0)
  const dots = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  const dot = dots[0]!
  const Pointer = doc.defaultView!.PointerEvent as unknown as typeof PointerEvent
  dot.setPointerCapture = () => undefined
  dot.dispatchEvent(new Pointer("pointerdown", { bubbles: true, clientX: 100, clientY: 10, button: 0, pointerId: 3 }))
  dot.dispatchEvent(new Pointer("pointermove", { bubbles: true, clientX: 130, clientY: 10, pointerId: 3 }))
  assert.deepEqual(moved, [], "nothing is reordered until the drop")
  assert.equal(dot.style.transform, "translateX(30px)", "the dragged dot follows the pointer")
  assert.equal(dots[1]!.style.transform, "translateX(-24px)", "the dot it passed makes room")
  assert.equal(dots[2]!.style.transform, "")
  dot.dispatchEvent(new Pointer("pointerup", { bubbles: true, clientX: 130, clientY: 10, pointerId: 3 }))
  assert.deepEqual(moved, [[0, 1]])
  assert.equal(dot.style.transform, "", "the drop hands the row back to the real order")
  assert.equal(dots[1]!.style.transform, "")
})

test("a small wobble is still a click, and switching works", () => {
  const { doc } = host()
  const picked: number[] = []
  const moved: [number, number][] = []
  const strip = createStrip(doc, { select: (index) => void picked.push(index), reorder: (from, to) => void moved.push([from, to]) }, plain)
  strip.place()
  strip.update(spaces(3), 1)
  const dot = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)][1]!
  const Pointer = doc.defaultView!.PointerEvent as unknown as typeof PointerEvent
  dot.setPointerCapture = () => undefined
  dot.dispatchEvent(new Pointer("pointerdown", { bubbles: true, clientX: 100, clientY: 10, button: 0, pointerId: 2 }))
  dot.dispatchEvent(new Pointer("pointerup", { bubbles: true, clientX: 102, clientY: 10, pointerId: 2 }))
  dot.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  assert.deepEqual(moved, [])
  assert.deepEqual(picked, [1])
})

test("nothing in the strip invites a click, and a pull opens the new-space slot", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  strip.place()
  strip.update(spaces(3), 0)
  assert.equal(doc.querySelectorAll("[data-spaces-add]").length, 0, "no plus unless it is being pulled")
  const ghost = doc.querySelector<HTMLElement>("[data-spaces-ghost]")!
  assert.equal(ghost.hidden, true, "the slot takes no room at rest")
  strip.pull(0.4)
  assert.equal(ghost.hidden, false)
  assert.equal(ghost.style.getPropertyValue("--spaces-pull"), "0.4")
  assert.equal(ghost.hasAttribute("data-spaces-armed"), false)
  strip.pull(1)
  assert.equal(ghost.style.getPropertyValue("--spaces-pull"), "1")
  assert.equal(ghost.hasAttribute("data-spaces-armed"), true)
  strip.pull(0)
  assert.equal(ghost.hidden, true)
})

test("accent tokens become host colours on the active dot only where given", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, (space) => (space.accent ? `var(--v2-state-fg-${space.accent})` : undefined))
  strip.place()
  strip.update([{ id: "a", name: "A", emoji: "🌱" }, { id: "b", name: "B", emoji: "🌿", accent: "info" }], 1)
  const dots = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  assert.equal(dots[1]!.style.getPropertyValue("--spaces-accent"), "var(--v2-state-fg-info)")
  assert.equal(dots[0]!.style.getPropertyValue("--spaces-accent"), "")
})

test("placing twice keeps one strip, and dispose removes it", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  strip.place()
  strip.place()
  assert.equal(doc.querySelectorAll(`[${STRIP}]`).length, 1)
  strip.dispose()
  assert.equal(doc.querySelectorAll(`[${STRIP}]`).length, 0)
})

test("without a sidebar the strip stays out, and placing again recovers when it appears", () => {
  const { doc } = host()
  doc.body.innerHTML = "<div></div>"
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  assert.equal(strip.place(), false)
  assert.equal(doc.querySelectorAll(`[${STRIP}]`).length, 0)
  const { doc: again } = host()
  assert.equal(createStrip(again, { select: plain, reorder: plain }, plain).place(), true)
})

test("so many spaces that they overflow: every dot is still drawn, so the track can scroll", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  strip.place()
  strip.update(spaces(12), 7)
  assert.equal(doc.querySelectorAll(`[${DOT}]`).length, 12)
  assert.equal(doc.querySelectorAll(`[${DOT}][aria-selected=true]`).length, 1)
})

test("a stale active index still marks exactly one dot", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, reorder: plain }, plain)
  strip.place()
  strip.update(spaces(2), 99)
  const selected = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)].filter((dot) => dot.getAttribute("aria-selected") === "true")
  assert.equal(selected.length, 1)
  assert.equal(selected[0]!.getAttribute("title"), "Space 2")
})
