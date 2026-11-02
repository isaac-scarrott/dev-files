import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
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

const mount = (rows: { id: string; name: string; status: string }[], onAction: (id: string, keyboard: boolean) => void = () => {}) => {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => <LaneChipRows ui={ui} actionLabel="Stop" icon={() => <i />} onAction={onAction} rows={rows} />, host)
  return { host, dispose, rows: () => [...host.querySelectorAll<HTMLElement>("[data-lane-chip-row]")] }
}
const key = (el: Element, name: string) => {
  const event = new ((globalThis as any).window.KeyboardEvent)("keydown", { key: name, bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}
const three = [{ id: "a", name: "one", status: "" }, { id: "b", name: "two", status: "" }, { id: "c", name: "three", status: "" }]

test("focus moves into the list on open", () => {
  const { dispose, rows, host } = mount(three)
  const active = document.activeElement as HTMLElement
  assert.ok(host.contains(active), "focus is inside the list")
  assert.ok(active === rows()[0] || active === host.querySelector("ul"))
  dispose()
})

test("Up and Down move between rows, Right reaches the action, Left comes back, Tab stays", async () => {
  const { dispose, rows } = mount(three)
  await Promise.resolve()
  rows()[0]!.focus()
  key(rows()[0]!, "ArrowDown")
  assert.ok(document.activeElement === rows()[1])
  key(rows()[1]!, "ArrowUp")
  assert.ok(document.activeElement === rows()[0])
  key(rows()[0]!, "ArrowRight")
  const button = rows()[0]!.querySelector("button")!
  assert.ok(document.activeElement === button)
  key(button, "ArrowDown")
  assert.ok(document.activeElement === rows()[1]!.querySelector("button"))
  key(document.activeElement!, "ArrowLeft")
  assert.ok(document.activeElement === rows()[1])
  assert.equal(key(rows()[1]!, "Tab").defaultPrevented, true)
  assert.equal(button.getAttribute("tabindex"), "-1")
  dispose()
})

test("after an action focus goes to the neighbouring row once the list has updated, and the rows survive a refresh", async () => {
  const [list, setList] = createSignal(three)
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => <LaneChipRows ui={ui} actionLabel="Stop" icon={() => <i />} onAction={(id) => setList((rows) => rows.filter((r) => r.id !== id))} rows={list()} />, host)
  const rows = () => [...host.querySelectorAll<HTMLElement>("[data-lane-chip-row]")]
  const before = rows()[2]
  setList((current) => current.map((r) => ({ ...r })))
  assert.ok(rows()[2] === before, "a refresh with the same ids keeps the row elements")
  rows()[1]!.querySelector("button")!.click()
  await Promise.resolve()
  assert.equal(rows().length, 2)
  assert.ok(rows()[1]!.contains(document.activeElement), "focus is on the neighbour that took its place (its action: the keyboard pressed this one)")
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

test("the popover matches the host's: no motion, max-content width, scrolls itself, rows keep their height", () => {
  assert.match(laneChipCss, /session-plugin-pill-popover"\] \{ animation: none; width: max-content; min-width: 240px; max-width: min\(360px, 100vw - 56px\); max-height: 270px; overflow-y: auto/)
  assert.match(laneChipCss, /\[data-lane-chip-row\] \{ flex: none;[^}]*height: 28px/)
  assert.match(laneChipCss, /z-index: 60/)
})
