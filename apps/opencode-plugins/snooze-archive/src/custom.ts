import { createComponent, createSignal, onCleanup, type JSX } from "solid-js"
import type { DialogHandle } from "@opencode/plugin/gui"
import type { Host } from "./host"
import { DAY, MAX_HORIZON, MINUTE, checkWake, firstDayOfWeek, formatTimeOfDay, formatWake, monthGrid, parseDuration, parseTimeOfDay, resolveLocal, uses12Hour, weekdayLabels, zoneLabel, type Fields } from "./time"

export const CHIPS = [["15m", 15 * MINUTE], ["30m", 30 * MINUTE], ["1h", 60 * MINUTE], ["2h", 120 * MINUTE], ["4h", 240 * MINUTE], ["1d", DAY], ["3d", 3 * DAY], ["1w", 7 * DAY]] as const

export interface Outcome { until?: number; message: string; tone: "ok" | "warn" | "error" | "idle" }
interface Day { y: number; mo: number; d: number }
const dayKey = (d: Day) => d.y * 10000 + d.mo * 100 + d.d
const addDays = (d: Day, n: number): Day => { const x = new Date(d.y, d.mo, d.d + n); return { y: x.getFullYear(), mo: x.getMonth(), d: x.getDate() } }
const addMonths = (d: Day, n: number): Day => { const last = new Date(d.y, d.mo + n + 1, 0).getDate(); const x = new Date(d.y, d.mo + n, Math.min(d.d, last)); return { y: x.getFullYear(), mo: x.getMonth(), d: x.getDate() } }

// The host has no calendar or time field, so the day grid is a small bespoke piece (native buttons, --v2 tokens);
// everything else is host primitives: Dialog, Button (mode switch, chips), IconButton (month arrows), TextInput.
export function openCustom(open: (render: (handle: DialogHandle) => JSX.Element) => DialogHandle, host: Host, options: { now?: () => number; locale?: string } = {}): Promise<number | undefined> {
  return new Promise((resolve) => {
    open((handle) => {
      onCleanup(() => resolve(undefined))
      return build(host, { ...options, done: (until) => { resolve(until); handle.close() } })
    })
  })
}

export function build(host: Host, options: { now?: () => number; locale?: string; done(until: number | undefined): void }): JSX.Element {
  const doc = document
  const now = options.now ?? Date.now
  const locale = options.locale
  const hour12 = uses12Hour(locale)
  const first = firstDayOfWeek(locale)
  const start = now()
  const [mode, setMode] = createSignal<"duration" | "date">("duration")
  const [text, setText] = createSignal("")
  const [timeText, setTimeText] = createSignal("")
  const nextHour = new Date(Math.ceil((start + 1) / 3_600_000) * 3_600_000)
  let selected: Day = { y: nextHour.getFullYear(), mo: nextHour.getMonth(), d: nextHour.getDate() }
  let view: Day = { ...selected, d: 1 }
  let focused: Day = selected
  setTimeText(formatTimeOfDay(nextHour.getHours(), nextHour.getMinutes() ? nextHour.getMinutes() : 0, hour12))
  const today = (): Day => { const d = new Date(now()); return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate() } }
  const last = (): Day => { const d = new Date(now() + MAX_HORIZON); return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate() } }

  const outcome = (): Outcome => {
    const at = now()
    const zone = (t: number) => zoneLabel(t, locale)
    if (mode() === "duration") {
      if (!text().trim()) return { message: "Enter a duration or pick one above.", tone: "idle" }
      const parsed = parseDuration(text())
      if ("error" in parsed) return { message: parsed.error, tone: "error" }
      const until = at + parsed.ms
      const check = checkWake(until, at)
      return check.ok ? { until, message: `Wakes ${formatWake(until, at, { locale, hour12 })} · ${zone(until)}`, tone: "ok" } : { message: check.reason, tone: "error" }
    }
    const time = parseTimeOfDay(timeText())
    if (!time) return { message: "Enter a time such as 9:30, 14:05 or 2:30 pm.", tone: "error" }
    const resolved = resolveLocal({ ...selected, h: time.h, mi: time.mi })
    const check = checkWake(resolved.at, at)
    if (!check.ok) return { message: check.reason, tone: "error" }
    const wake = `${formatWake(resolved.at, at, { locale, hour12 })} · ${zone(resolved.at)}`
    const clock = (f: Fields) => formatTimeOfDay(f.h, f.mi, hour12)
    if (resolved.resolution === "gap") return { until: resolved.at, tone: "warn", message: `${clock(resolved.requested)} doesn't exist that day (clocks jump forward). Wakes at ${clock(resolved.actual)}, ${wake}` }
    if (resolved.resolution === "overlap") return { until: resolved.at, tone: "warn", message: `${clock(resolved.requested)} happens twice that day (clocks go back). Using the first one: ${wake}` }
    return { until: resolved.at, message: `Wakes ${wake}`, tone: "ok" }
  }

  const root = doc.createElement("div")
  root.dataset.saPicker = ""
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, parent?: HTMLElement) => {
    const el = doc.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    parent?.append(el)
    return el
  }
  const disposers: (() => void)[] = []
  onCleanup(() => disposers.forEach((d) => d()))
  const mount = (el: HTMLElement, view: () => JSX.Element) => { disposers.push(host.mount(el, view)) }

  const tabs = make("div", { role: "tablist", "aria-label": "Snooze until", "data-sa-segmented": "" }, root)
  const tabButtons = new Map<string, HTMLElement>()
  for (const [id, label] of [["duration", "Duration"], ["date", "Date & time"]] as const) {
    const slot = make("span", {}, tabs)
    mount(slot, () => createComponent(host.ui.Button, {
      get variant() { return mode() === id ? "neutral" : "ghost-muted" },
      size: "small", class: "sa-pk-tab", onClick: () => switchTo(id), children: label,
    }))
    const button = slot.querySelector("button")!
    button.setAttribute("role", "tab")
    tabButtons.set(id, button)
  }
  tabs.onkeydown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const next = mode() === "duration" ? "date" : "duration"
    switchTo(next)
    tabButtons.get(next)?.focus()
  }

  const durationPanel = make("div", { role: "tabpanel", "data-sa-panel-mode": "duration" }, root)
  const chips = make("div", { "data-sa-chips": "", role: "group", "aria-label": "Quick durations" }, durationPanel)
  for (const [label] of CHIPS) {
    const slot = make("span", {}, chips)
    mount(slot, () => createComponent(host.ui.Button, {
      get variant() { return text().trim() === label ? "neutral" : "ghost-muted" },
      size: "small", onClick: () => { setText(label); update() }, children: label,
    }))
  }
  const durationField = make("div", {}, durationPanel)
  mount(durationField, () => createComponent(host.ui.TextInput, {
    get value() { return text() }, onInput: (v: string) => { setText(v); update() },
    label: "Duration", placeholder: "e.g. 90m, 1h30, 2 days, 1.5h", autofocus: true, onSubmit: () => confirm(),
    get invalid() { return mode() === "duration" && outcome().tone === "error" && !!text().trim() },
  }))

  const datePanel = make("div", { role: "tabpanel", "data-sa-panel-mode": "date" }, root)
  const nav = make("div", { "data-sa-nav": "" }, datePanel)
  const prevSlot = make("span", {}, nav)
  const title = make("div", { "data-sa-month": "", "aria-live": "polite" }, nav)
  const nextSlot = make("span", {}, nav)
  mount(prevSlot, () => createComponent(host.ui.IconButton, { icon: "chevron-left", label: "Previous month", size: "small", variant: "ghost-muted", onClick: () => shiftView(-1) }))
  mount(nextSlot, () => createComponent(host.ui.IconButton, { icon: "chevron-right", label: "Next month", size: "small", variant: "ghost-muted", onClick: () => shiftView(1) }))
  const grid = make("div", { role: "grid", "aria-label": "Choose a day", "data-sa-grid": "" }, datePanel)
  const timeField = make("div", { "data-sa-time": "" }, datePanel)
  mount(timeField, () => createComponent(host.ui.TextInput, {
    get value() { return timeText() }, onInput: (v: string) => { setTimeText(v); update() },
    label: "Time", placeholder: hour12 ? "9:30 AM" : "09:30", onSubmit: () => confirm(),
    get invalid() { return mode() === "date" && !parseTimeOfDay(timeText()) },
  }))
  // Up/Down nudge the time in 5 minute steps (Shift: an hour), staying within the day.
  timeField.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const t = parseTimeOfDay(timeText()) ?? { h: nextHour.getHours(), mi: 0 }
    const step = (event.shiftKey ? 60 : 5) * (event.key === "ArrowUp" ? 1 : -1)
    const total = (((t.h * 60 + t.mi + step) % 1440) + 1440) % 1440
    setTimeText(formatTimeOfDay(Math.floor(total / 60), total % 60, hour12)); update()
  }, true)
  const status = make("p", { role: "status", "data-sa-outcome": "" }, root)

  const confirmButtonDisabled = createSignal(true)
  const confirm = () => {
    const out = outcome()
    if (out.until !== undefined) options.done(out.until)
  }
  const footer = make("div", { "data-sa-footer": "" })
  const cancelSlot = make("span", {}, footer), okSlot = make("span", {}, footer)
  mount(cancelSlot, () => createComponent(host.ui.Button, { variant: "ghost", onClick: () => options.done(undefined), children: "Cancel" }))
  mount(okSlot, () => createComponent(host.ui.Button, { variant: "contrast", get disabled() { return confirmButtonDisabled[0]() }, onClick: () => confirm(), children: "Snooze" }))

  function switchTo(next: "duration" | "date") { setMode(next); update() }
  function shiftView(n: number) { view = addMonths(view, n); focused = clampDay({ ...view, d: Math.min(focused.d, 28) }); update() }
  const clampDay = (d: Day) => dayKey(d) < dayKey(today()) ? today() : dayKey(d) > dayKey(last()) ? last() : d

  function paintGrid() {
    const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(view.y, view.mo, 1))
    if (title.textContent !== month) title.textContent = month
    const known = grid.querySelector<HTMLElement>("button:focus")
    const hadFocus = !!known
    grid.replaceChildren()
    const header = make("div", { role: "row", "data-sa-weekdays": "" }, grid)
    for (const name of weekdayLabels(first, locale)) make("span", { role: "columnheader" }, header).textContent = name
    const lo = dayKey(today()), hi = dayKey(last())
    for (const week of monthGrid(view.y, view.mo, first)) {
      const row = make("div", { role: "row" }, grid)
      for (const day of week) {
        const key = dayKey(day)
        const cell = make("button", { type: "button", role: "gridcell", "data-sa-day": "" }, row) as HTMLButtonElement
        cell.textContent = String(day.d)
        const label = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(day.y, day.mo, day.d))
        cell.setAttribute("aria-label", label)
        if (!day.inMonth) cell.dataset.outside = ""
        if (key === dayKey(today())) { cell.dataset.today = ""; cell.setAttribute("aria-current", "date") }
        if (key === dayKey(selected)) { cell.dataset.selected = ""; cell.setAttribute("aria-selected", "true") }
        const blocked = key < lo || key > hi
        if (blocked) { cell.disabled = true; cell.dataset.disabled = "" }
        cell.tabIndex = key === dayKey(focused) ? 0 : -1
        cell.onclick = () => { selected = { y: day.y, mo: day.mo, d: day.d }; focused = selected; if (!day.inMonth) view = { ...selected, d: 1 }; update(); focusDay() }
        cell.onkeydown = (event) => {
          const moves: Record<string, () => Day> = {
            ArrowLeft: () => addDays(focused, -1), ArrowRight: () => addDays(focused, 1), ArrowUp: () => addDays(focused, -7), ArrowDown: () => addDays(focused, 7),
            PageUp: () => addMonths(focused, -1), PageDown: () => addMonths(focused, 1),
            Home: () => addDays(focused, -((new Date(focused.y, focused.mo, focused.d).getDay() - first + 7) % 7)),
            End: () => addDays(focused, 6 - ((new Date(focused.y, focused.mo, focused.d).getDay() - first + 7) % 7)),
          }
          const move = moves[event.key]
          if (!move) return
          event.preventDefault(); event.stopPropagation()
          focused = clampDay(move())
          if (focused.y !== view.y || focused.mo !== view.mo) view = { ...focused, d: 1 }
          update(); focusDay()
        }
      }
    }
    if (hadFocus) focusDay()
    prevSlot.toggleAttribute("data-inert", dayKey(addDays({ ...view, d: 1 }, -1)) < lo)
    nextSlot.toggleAttribute("data-inert", dayKey(addMonths({ ...view, d: 1 }, 1)) > hi)
  }
  const focusDay = () => grid.querySelector<HTMLElement>('button[tabindex="0"]')?.focus()

  function update() {
    durationPanel.hidden = mode() !== "duration"
    datePanel.hidden = mode() !== "date"
    for (const [id, button] of tabButtons) button.setAttribute("aria-selected", String(mode() === id))
    if (mode() === "date") paintGrid()
    const out = outcome()
    if (status.textContent !== out.message) status.textContent = out.message
    status.dataset.tone = out.tone
    confirmButtonDisabled[1](out.until === undefined)
  }
  update()

  // Enter confirms from anywhere except a button that has its own action (chips, mode switch, days, month arrows).
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || (event.target as HTMLElement).closest?.("button")) return
    event.preventDefault(); confirm()
  })
  return createComponent(host.ui.Dialog, { title: "Snooze until", description: "This device only. Work in the session continues.", children: root, footer, size: "fit" })
}

export const customCss = `
[data-sa-picker] { display: flex; flex-direction: column; gap: 12px; min-width: 300px; }
[data-sa-picker] [hidden] { display: none; }
[data-sa-segmented] { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--v2-background-bg-layer-01); align-self: flex-start; }
[data-sa-chips] { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
[data-sa-nav] { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
[data-sa-nav] [data-inert] { opacity: 0.35; pointer-events: none; }
[data-sa-month] { font-size: 13px; font-weight: 530; color: var(--v2-text-text-base); }
[data-sa-grid] { display: flex; flex-direction: column; gap: 2px; }
[data-sa-grid] [role="row"] { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
[data-sa-weekdays] span { text-align: center; font-size: 11px; color: var(--v2-text-text-faint); padding: 2px 0; }
[data-sa-day] { height: 32px; border-radius: 6px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--v2-text-text-base); background: transparent; border: 0; position: relative; cursor: default; }
[data-sa-day][data-outside] { color: var(--v2-text-text-faint); }
[data-sa-day]:hover:not(:disabled) { background: var(--v2-background-bg-layer-01); }
[data-sa-day]:focus-visible { outline: 2px solid var(--v2-background-bg-accent); outline-offset: -2px; }
[data-sa-day][data-selected] { box-shadow: inset 0 0 0 1.5px var(--v2-background-bg-accent); font-weight: 600; }
[data-sa-day][data-today]::after { content: ""; position: absolute; inset-inline: 0; bottom: 3px; margin: auto; width: 3px; height: 3px; border-radius: 50%; background: var(--v2-background-bg-accent); }
[data-sa-day]:disabled { color: var(--v2-text-text-faint); opacity: 0.4; }
[data-sa-time] { margin-top: 8px; }
[data-sa-outcome] { margin: 0; min-height: 32px; font-size: 12px; color: var(--v2-text-text-muted); }
[data-sa-outcome][data-tone="error"] { color: var(--v2-text-text-critical, var(--v2-text-text-base)); }
[data-sa-outcome][data-tone="warn"] { color: var(--v2-text-text-base); }
[data-sa-footer] { display: flex; justify-content: flex-end; gap: 8px; }
`
