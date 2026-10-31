import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot } from "solid-js"
import { Window } from "happy-dom"
import { build } from "./custom"
import { fakeHost } from "./testui"

function open(now = Date.parse("2026-11-02T10:00:00Z"), locale = "en-GB") {
  const window = new Window()
  const doc = window.document as unknown as Document
  Object.assign(globalThis, { window, document: doc })
  const host = fakeHost(doc)
  const done: (number | undefined)[] = []
  let dispose = () => {}
  createRoot((stop) => { dispose = stop; doc.body.append(build(host, { now: () => now, locale, done: (v) => done.push(v) }) as Node) })
  const q = <T extends Element>(sel: string) => doc.querySelector(sel) as unknown as T
  const key = (el: Element, k: string, init: object = {}) => el.dispatchEvent(new (window as any).KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }))
  const type = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new (window as any).Event("input", { bubbles: true })) }
  return { doc, done, q, key, type, status: () => q("[data-sa-outcome]").textContent, dispose, window }
}

test("duration: chips and free text resolve a live wake time; Enter confirms; invalid input disables", () => {
  const t = open()
  const snooze = [...t.doc.querySelectorAll("button")].find((b) => b.textContent === "Snooze") as HTMLButtonElement
  assert.equal(snooze.disabled, true)
  assert.match(t.status()!, /Enter a duration/)
  ;[...t.doc.querySelectorAll("button")].find((b) => b.textContent === "2h")!.click()
  assert.match(t.status()!, /^Wakes Mon.*2 Nov.*12:00/)
  const input = t.q<HTMLInputElement>("input")
  t.type(input, "1h30"); assert.match(t.status()!, /11:30/)
  t.type(input, "5x"); assert.match(t.status()!, /Unknown unit/); assert.equal(snooze.disabled, true); assert.equal(input.getAttribute("aria-invalid"), "true")
  t.type(input, "400d"); assert.match(t.status()!, /within the next year/)
  t.type(input, "90m"); assert.equal(snooze.disabled, false)
  input.dispatchEvent(new (t.window as any).KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  assert.deepEqual(t.done, [Date.parse("2026-11-02T11:30:00Z")])
  t.dispose()
})

test("date & time: calendar disables past days, arrows move focus, month paging, time field arrows", () => {
  const t = open()
  ;[...t.doc.querySelectorAll("[role=tab]")].find((b) => b.textContent === "Date & time")!.dispatchEvent(new (t.window as any).MouseEvent("click", { bubbles: true }))
  assert.equal(t.q<HTMLElement>('[data-sa-panel-mode="date"]').hidden, false)
  const days = () => [...t.doc.querySelectorAll<HTMLButtonElement>("[data-sa-day]")]
  const cell = (n: number) => days().find((d) => d.textContent === String(n) && !d.hasAttribute("data-outside"))!
  assert.equal(cell(1).disabled, true, "1 Nov is past")
  assert.equal(cell(2).disabled, false); assert.ok(cell(2).hasAttribute("data-today"))
  assert.equal(t.doc.querySelector('[role=columnheader]')!.textContent, "Mon", "en-GB week starts Monday")
  const focused = () => t.doc.querySelector<HTMLElement>('[data-sa-day][tabindex="0"]')!
  assert.equal(focused().textContent, "2", "11:00 today is the next hour; default day is today")
  t.key(focused(), "ArrowRight"); assert.equal(focused().textContent, "3")
  t.key(focused(), "ArrowLeft"); t.key(focused(), "ArrowLeft"); assert.equal(focused().textContent, "2", "cannot move into the past")
  t.key(focused(), "ArrowDown"); assert.equal(focused().textContent, "9")
  t.key(focused(), "PageDown"); assert.match(t.q("[data-sa-month]").textContent!, /December 2026/)
  focused().click()
  const time = t.q<HTMLInputElement>('[data-sa-time] input')
  t.type(time, "9:30"); assert.match(t.status()!, /Wakes .*Dec.*9:30/)
  t.key(time, "ArrowUp"); assert.equal(time.value, "09:35")
  t.key(time, "ArrowDown", { shiftKey: true }); assert.equal(time.value, "08:35")
  t.type(time, "25:00"); assert.match(t.status()!, /Enter a time/)
  t.dispose()
})

test("date & time: nonexistent and ambiguous local times warn with the resolution", () => {
  const previous = process.env.TZ
  process.env.TZ = "America/New_York"
  try {
    const t = open(Date.parse("2026-03-07T12:00:00Z"), "en-US")
    ;[...t.doc.querySelectorAll("[role=tab]")].find((b) => b.textContent === "Date & time")!.dispatchEvent(new (t.window as any).MouseEvent("click", { bubbles: true }))
    ;[...t.doc.querySelectorAll<HTMLButtonElement>("[data-sa-day]")].find((d) => d.textContent === "8" && !d.hasAttribute("data-outside"))!.click()
    t.type(t.q<HTMLInputElement>("[data-sa-time] input"), "2:30 AM")
    assert.match(t.status()!, /doesn't exist.*Wakes at 3:30 AM/)
    t.dispose()
    const u = open(Date.parse("2026-10-30T12:00:00Z"), "en-US")
    ;[...u.doc.querySelectorAll("[role=tab]")].find((b) => b.textContent === "Date & time")!.dispatchEvent(new (u.window as any).MouseEvent("click", { bubbles: true }))
    ;(u.doc.querySelector('button[aria-label="Next month"]') as HTMLElement).click()
    ;[...u.doc.querySelectorAll<HTMLButtonElement>("[data-sa-day]")].find((d) => d.textContent === "1" && !d.hasAttribute("data-outside"))!.click()
    u.type(u.q<HTMLInputElement>("[data-sa-time] input"), "1:30 AM")
    assert.match(u.status()!, /happens twice.*first one/)
    u.dispose()
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})

test("Cancel resolves undefined", () => {
  const t = open()
  ;[...t.doc.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click()
  assert.deepEqual(t.done, [undefined])
  t.dispose()
})
