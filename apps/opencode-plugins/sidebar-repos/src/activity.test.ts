import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createTicker, formatAge, lastActivity, TICK_MS } from "./activity"
import { ACTIVE_AT, hasIndicator, renderTimes, stampActivity } from "./rowtime"

const M = 60_000
const H = 60 * M
const D = 24 * H

test("formatAge is compact and has no ago", () => {
  const now = 10_000_000_000
  const cases: [number, string][] = [
    [0, "now"], [59_999, "now"], [-5000, "now"], [M, "1m"], [5 * M, "5m"], [59 * M, "59m"], [H, "1h"], [2 * H + 1, "2h"],
    [23 * H, "23h"], [D, "1d"], [3 * D, "3d"], [6 * D, "6d"], [7 * D, "1w"], [15 * D, "2w"], [29 * D, "4w"],
    [30 * D, "1mo"], [125 * D, "4mo"], [364 * D, "12mo"], [365 * D, "1y"],
  ]
  for (const [age, text] of cases) assert.equal(formatAge(now - age, now), text, `${age}`)
})

test("lastActivity takes the newest user or assistant message, else session.time.updated", () => {
  const messages = [
    { type: "user", time: { created: 10 } },
    { type: "assistant", time: { created: 20, completed: 30 } },
    { type: "agent_selected", time: { created: 99 } },
    { type: "idle" },
  ]
  assert.equal(lastActivity(messages, 5), 30)
  assert.equal(lastActivity([...messages, { type: "user", time: { created: 40 } }], 5), 40)
  assert.equal(lastActivity([{ type: "assistant", time: { created: 20 } }], 5), 20)
  assert.equal(lastActivity([], 5), 5)
  assert.equal(lastActivity(undefined, 5), 5)
  assert.equal(lastActivity(undefined, undefined), undefined)
})

function rows(markup: string) {
  const document = new Window().document as unknown as Document
  document.body.innerHTML = markup
  return document
}
const row = (attrs = "", key = "k1") => `<div data-tab-key="${key}"><div data-titlebar-tab data-orientation="vertical" ${attrs}><a data-slot="tab-link"></a><div data-slot="tab-close"></div></div></div>`
const measure = (text: string) => text.length * 6

test("a row with no indicator shows its time in the close slot", () => {
  const document = rows(row())
  stampActivity(document, new Map([["k1", 1000]]))
  renderTimes(document, 1000 + 5 * M, measure)
  const tab = document.querySelector<HTMLElement>("[data-titlebar-tab]")!
  assert.equal(document.querySelector("[data-slot=tab-close] > [data-sidebar-time]")?.textContent, "5m")
  assert.ok(tab.hasAttribute("data-sidebar-time-shown"))
  assert.equal(tab.style.getPropertyValue("--sidebar-time-width"), "12px")
  assert.ok(document.querySelector<HTMLElement>("[data-sidebar-time]")!.title.length > 0)
})

test("any indicator hides the time and removes it", () => {
  for (const attrs of ["data-status='busy'", "data-status='attention'", "data-status='unread'", "data-sidebar-attention='permission'"]) {
    const document = rows(row())
    stampActivity(document, new Map([["k1", 0]]))
    renderTimes(document, M, measure)
    assert.ok(document.querySelector("[data-sidebar-time]"), attrs)
    const tab = document.querySelector("[data-titlebar-tab]")!
    const [name, value] = attrs.split("=")
    tab.setAttribute(name, value?.replace(/'/g, "") ?? "")
    assert.ok(hasIndicator(tab), attrs)
    renderTimes(document, M, measure)
    assert.equal(document.querySelector("[data-sidebar-time]"), null, attrs)
    assert.ok(!tab.hasAttribute("data-sidebar-time-shown"), attrs)
    tab.removeAttribute(name)
    renderTimes(document, M, measure)
    assert.ok(document.querySelector("[data-sidebar-time]"), `${attrs} back`)
  }
})

test("rows of other plugins keep their own attribute; live rows follow the store", () => {
  const document = rows(row("", "live") + `<div data-titlebar-tab-slot><div data-titlebar-tab data-orientation="vertical" ${ACTIVE_AT}="1000"><div data-slot="tab-close"></div></div></div>`)
  stampActivity(document, new Map())
  renderTimes(document, 1000 + 2 * H, measure)
  const times = [...document.querySelectorAll("[data-sidebar-time]")]
  assert.deepEqual(times.map((t) => t.textContent), ["2h"])
  stampActivity(document, new Map([["live", 1000]]))
  renderTimes(document, 1000 + 3 * D, measure)
  assert.deepEqual([...document.querySelectorAll("[data-sidebar-time]")].map((t) => t.textContent), ["3d", "3d"])
})

test("renderTimes writes nothing when the value is unchanged", () => {
  const document = rows(row())
  stampActivity(document, new Map([["k1", 0]]))
  renderTimes(document, M, measure)
  const records: unknown[] = []
  const observer = new (document.defaultView as unknown as Window).MutationObserver((r) => records.push(...r))
  observer.observe(document.body as never, { subtree: true, childList: true, attributes: true, characterData: true })
  renderTimes(document, M + 1000, measure)
  stampActivity(document, new Map([["k1", 0]]))
  return Promise.resolve().then(() => assert.equal(records.length, 0))
})

test("one ticker: 30s cadence, only while visible, immediate refresh on wake", () => {
  const timers = new Map<number, () => void>()
  let next = 0
  let visible = true
  let ticks = 0
  const intervals: number[] = []
  const ticker = createTicker({
    setInterval: (fn, ms) => { intervals.push(ms); timers.set(++next, fn); return next },
    clearInterval: (id) => { timers.delete(id) },
    visible: () => visible,
  }, () => { ticks++ })
  assert.deepEqual(intervals, [TICK_MS])
  assert.equal(TICK_MS, 30_000)
  assert.equal(timers.size, 1)
  ticker.wake()
  assert.equal(timers.size, 1, "still one timer after wake")
  assert.equal(ticks, 1)
  visible = false
  ticker.wake()
  assert.equal(timers.size, 0, "stopped while hidden")
  assert.equal(ticks, 1)
  visible = true
  ticker.wake()
  assert.equal(timers.size, 1)
  assert.equal(ticks, 2)
  ticker.dispose()
  assert.equal(timers.size, 0)
})
