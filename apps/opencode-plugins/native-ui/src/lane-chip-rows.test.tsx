import assert from "node:assert/strict"
import { test } from "node:test"
import { render } from "solid-js/web"
import type { Ui } from "@opencode/plugin/gui"
import { laneChipCss, LaneChipRows } from "./lane-chip-rows.js"

const ui = {
  IconButton: (props: any) => {
    const el = document.createElement("button")
    el.type = "button"
    el.setAttribute("aria-label", props.label)
    el.onclick = (event) => props.onClick?.(event)
    return el as any
  },
} as unknown as Ui

test("each row is a name, a muted status and a real button that names the row", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const acted: string[] = []
  const dispose = render(
    () => <LaneChipRows ui={ui} actionLabel="Stop monitor" icon={() => <i />} onAction={(id) => acted.push(id)} rows={[{ id: "a", name: "watch", status: "3 events" }, { id: "b", name: "build", status: "1 event" }]} />,
    host,
  )
  const rows = host.querySelectorAll("[data-lane-chip-row]")
  assert.equal(rows.length, 2)
  assert.equal(rows[0]!.querySelector('[data-slot="lane-chip-row-name"]')!.textContent, "watch")
  assert.equal(rows[0]!.querySelector('[data-slot="lane-chip-row-status"]')!.textContent, "3 events")
  const stop = rows[0]!.querySelector("button")!
  assert.equal(stop.getAttribute("aria-label"), "Stop monitor: watch")
  stop.click()
  assert.deepEqual(acted, ["a"])
  dispose()
})

test("focus moves to the neighbouring row's action before the row goes", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(
    () => <LaneChipRows ui={ui} actionLabel="Stop" icon={() => <i />} onAction={() => {}} rows={[{ id: "a", name: "one", status: "" }, { id: "b", name: "two", status: "" }]} />,
    host,
  )
  const buttons = host.querySelectorAll("button")
  buttons[0]!.click()
  assert.equal(document.activeElement, buttons[1])
  dispose()
})

test("the clock placeholder is hidden and drawn as the clock only inside plugin pills", () => {
  assert.match(laneChipCss, /\[data-slot="session-plugin-pill"\]:has\(use\[href\$="icon-outline-rotate-clockwise"\]\)/)
})

test("the action says whether the keyboard pressed it, so focus can follow", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const seen: boolean[] = []
  const dispose = render(
    () => <LaneChipRows ui={ui} actionLabel="Stop" icon={() => <i />} onAction={(_, keyboard) => seen.push(keyboard)} rows={[{ id: "a", name: "one", status: "" }]} />,
    host,
  )
  const button = host.querySelector("button")!
  button.click()
  button.dispatchEvent(new ((globalThis as any).window.MouseEvent)("click", { bubbles: true, detail: 1 }))
  assert.deepEqual(seen, [true, false])
  dispose()
})
