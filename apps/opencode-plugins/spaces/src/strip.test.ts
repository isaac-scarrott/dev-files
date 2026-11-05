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
  const strip = createStrip(doc, { select: plain, create: plain }, plain)
  assert.equal(strip.place(), true)
  const element = doc.querySelector(`[${STRIP}]`)!
  assert.equal(element.parentElement?.getAttribute("class"), "flex size-full flex-col")
  assert.equal(element.nextElementSibling?.getAttribute("data-slot"), "vertical-tabs-footer")
})

test("one space shows nothing, two show a dot each with the active one marked", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, create: plain }, plain)
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
  const strip = createStrip(doc, { select: (index) => void picked.push(index), create: plain }, plain)
  strip.place()
  strip.update(spaces(3), 0)
  const dots = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  dots[2]!.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  assert.deepEqual(picked, [2])
})

test("the add button creates a space", () => {
  const { doc } = host()
  let created = 0
  const strip = createStrip(doc, { select: plain, create: () => void (created += 1) }, plain)
  strip.place()
  strip.update(spaces(2), 0)
  doc.querySelector<HTMLElement>("[data-spaces-add]")!.dispatchEvent(new (doc.defaultView!.MouseEvent)("click", { bubbles: true }))
  assert.equal(created, 1)
})

test("accent tokens become host colours on the active dot only where given", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, create: plain }, (space) => (space.accent ? `var(--v2-state-fg-${space.accent})` : undefined))
  strip.place()
  strip.update([{ id: "a", name: "A", emoji: "🌱" }, { id: "b", name: "B", emoji: "🌿", accent: "info" }], 1)
  const dots = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
  assert.equal(dots[1]!.style.getPropertyValue("--spaces-accent"), "var(--v2-state-fg-info)")
  assert.equal(dots[0]!.style.getPropertyValue("--spaces-accent"), "")
})

test("placing twice keeps one strip, and dispose removes it", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, create: plain }, plain)
  strip.place()
  strip.place()
  assert.equal(doc.querySelectorAll(`[${STRIP}]`).length, 1)
  strip.dispose()
  assert.equal(doc.querySelectorAll(`[${STRIP}]`).length, 0)
})

test("without a sidebar the strip stays out, and placing again recovers when it appears", () => {
  const { doc } = host()
  doc.body.innerHTML = "<div></div>"
  const strip = createStrip(doc, { select: plain, create: plain }, plain)
  assert.equal(strip.place(), false)
  assert.equal(doc.querySelectorAll(`[${STRIP}]`).length, 0)
  const { doc: again } = host()
  assert.equal(createStrip(again, { select: plain, create: plain }, plain).place(), true)
})

test("so many spaces that they overflow: every dot is still drawn, so the track can scroll", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, create: plain }, plain)
  strip.place()
  strip.update(spaces(12), 7)
  assert.equal(doc.querySelectorAll(`[${DOT}]`).length, 12)
  assert.equal(doc.querySelectorAll(`[${DOT}][aria-selected=true]`).length, 1)
})

test("a stale active index still marks exactly one dot", () => {
  const { doc } = host()
  const strip = createStrip(doc, { select: plain, create: plain }, plain)
  strip.place()
  strip.update(spaces(2), 99)
  const selected = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)].filter((dot) => dot.getAttribute("aria-selected") === "true")
  assert.equal(selected.length, 1)
  assert.equal(selected[0]!.getAttribute("title"), "Space 2")
})
