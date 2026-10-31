import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { nearestAbove, snippet, userRows } from "./jump"

function stub(top: number, bottom: number) {
  return { top, bottom, left: 0, right: 0, width: 100, height: bottom - top, x: 0, y: 0, toJSON() {} } as DOMRect
}

test("the nearest message is the last one that has left the top of the reading area", () => {
  const rows = [
    { element: 1 as unknown as HTMLElement, top: -900, bottom: -700 },
    { element: 2 as unknown as HTMLElement, top: -300, bottom: -100 },
    { element: 3 as unknown as HTMLElement, top: 120, bottom: 300 },
    { element: 4 as unknown as HTMLElement, top: 400, bottom: 520 },
  ]
  assert.equal(nearestAbove(rows, 0)?.element, 2)
  assert.equal(nearestAbove(rows, 200)?.element, 2)
  assert.equal(nearestAbove(rows, -150)?.element, 1)
  assert.equal(nearestAbove(rows, -650)?.element, 1)
  assert.equal(nearestAbove(rows, -1000), undefined)
  assert.equal(nearestAbove([...rows].reverse(), 0)?.element, 2)
})

test("the label collapses whitespace and ellipsises long prompts", () => {
  const document = new Window().document as unknown as Document
  document.body.innerHTML = `
    <div data-timeline-row="UserMessage">
      <div data-slot="user-message-text">
        Fix   the
        sidebar   spacing
      </div>
    </div>`
  const row = document.querySelector<HTMLElement>("[data-timeline-row='UserMessage']")!
  assert.equal(snippet(row), "Fix the sidebar spacing")
  assert.equal(snippet(row, 8), "Fix the…")
})

test("rows still measuring an empty box are not jump targets", () => {
  const document = new Window().document as unknown as Document
  document.body.innerHTML = `
    <div data-slot="session-timeline-scroll">
      <div data-timeline-row="UserMessage">mounted</div>
      <div data-timeline-row="UserMessage">measuring</div>
      <div data-timeline-row="AssistantPart">reply</div>
    </div>`
  const container = document.querySelector<HTMLElement>("[data-slot='session-timeline-scroll']")!
  const [mounted, measuring] = [...container.querySelectorAll<HTMLElement>("[data-timeline-row='UserMessage']")]
  mounted.getBoundingClientRect = () => stub(-80, 0)
  measuring.getBoundingClientRect = () => stub(0, 0)

  const rows = userRows(container)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].element, mounted)
  assert.equal(nearestAbove(rows, 10)?.element, mounted)
})
