import { createMemo, For, onMount, type JSX } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import { HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_LIVE_PLACEHOLDER, heartbeatChipCss, heartbeatIconCss } from "./heartbeat"
import { spinnerCss } from "./spinner"

// The rows inside a composer chip's popover, built to read and behave like the host's own activity rows (the "1 subagent"
// popover): one 28px line, the name at the start, the status as the muted trailing text where the host shows the elapsed time,
// and the Stop action taking that place on hover or focus. The host's popover (`[data-composer-pill-panel]`) is the shell; its
// width, height, scroll and motion are matched in `laneChipCss`. Keyboard: focus moves into the list on open, Up and Down
// move between rows, Right reaches a row's action and Left comes back, Tab stays inside (the host's menu traps it), and
// Escape is the host's. The action is not a Tab stop (the host's Stop is not either) but Right reaches it, which the host's
// menu does not offer: there Stop is mouse only.

export interface LaneChipRow {
  id: string
  name: string
  /** The muted trailing text (the host shows the elapsed time here). */
  status: string
  /** The item is alive but not at work (a paused monitor): its glyph rests instead of beating. */
  resting?: boolean
}

export interface LaneChipRowsProps {
  ui: Ui
  rows: readonly LaneChipRow[]
  /** The row's glyph; the row is read inside the glyph so a change of state animates it instead of replacing it. */
  icon: (row: () => LaneChipRow | undefined) => JSX.Element
  /** Accessible name of each row's action, e.g. "Stop monitor". */
  actionLabel: string
  /** `keyboard` is true when Enter or Space pressed the action (a click's `detail` is 0). */
  onAction(id: string, keyboard: boolean): void
  /** Whether the popover was opened with the keyboard (its first row is then highlighted); a pointer open highlights nothing. */
  keyboardOpen?: () => boolean
}

const ROW = "[data-lane-chip-row]"
const ACTION = '[data-slot="lane-chip-row-action"] button'

// `Ui.IconButton` takes no tabIndex; the host's own Stop is not a Tab stop either (arrow keys reach it here).
const notTabStop = (el: HTMLElement) => queueMicrotask(() => el.querySelector("button")?.setAttribute("tabindex", "-1"))

export function LaneChipRows(props: LaneChipRowsProps) {
  let list!: HTMLUListElement
  // Rows are keyed by id, not by object: the list is rebuilt on every refresh, and recreated rows would drop the focus.
  const ids = createMemo(() => props.rows.map((row) => row.id), [], { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) })
  const rows = () => [...list.querySelectorAll<HTMLElement>(ROW)]
  const rowOf = (el: Element | null) => el?.closest<HTMLElement>(ROW) ?? null
  const actionOf = (row: HTMLElement | undefined) => row?.querySelector<HTMLElement>(ACTION)

  // Into the list on open. A keyboard open lands on the first row; a pointer open lands on the list itself, so nothing is
  // highlighted until an arrow key is pressed, as in the host's menu.
  onMount(() => {
    if (props.keyboardOpen?.() === false) list.focus()
    else (rows()[0] ?? list).focus()
  })

  const move = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    const all = rows()
    const here = rowOf(target)
    const onAction = target.matches(ACTION)
    const index = here ? all.indexOf(here) : -1
    const go = (row: HTMLElement | undefined) => {
      if (!row) return
      event.preventDefault()
      ;(onAction ? (actionOf(row) ?? row) : row).focus()
    }
    switch (event.key) {
      case "Tab":
        event.preventDefault()
        return
      case "ArrowDown":
        return go(index < 0 ? all[0] : all[index + 1])
      case "ArrowUp":
        return go(index < 0 ? all.at(-1) : all[index - 1])
      case "Home":
        return go(all[0])
      case "End":
        return go(all.at(-1))
      case "ArrowRight":
        if (!onAction && actionOf(here ?? undefined)) {
          event.preventDefault()
          actionOf(here ?? undefined)!.focus()
        }
        return
      case "ArrowLeft":
        if (onAction && here) {
          event.preventDefault()
          here.focus()
        }
        return
    }
  }

  // After an action, focus goes to the neighbouring row once the list has updated (the row is still there until then).
  const afterAction = (row: HTMLElement, keyboard: boolean) => {
    const all = rows()
    const neighbour = all[all.indexOf(row) + 1] ?? all[all.indexOf(row) - 1]
    if (!neighbour) return
    const id = neighbour.dataset.laneChipRow
    queueMicrotask(() => {
      const next = rows().find((candidate) => candidate.dataset.laneChipRow === id) ?? rows()[0]
      const target = keyboard ? (actionOf(next) ?? next) : next
      target?.focus()
    })
  }

  return (
    <ul ref={list} data-lane-chip-rows role="list" tabindex="-1" onKeyDown={move}>
      <For each={ids()}>
        {(id) => {
          const row = () => props.rows.find((candidate) => candidate.id === id)
          return (
            <li data-lane-chip-row={id} tabindex="-1">
              <span data-slot="lane-chip-row-icon" aria-hidden="true">
                {props.icon(row)}
              </span>
              <span data-slot="lane-chip-row-name" dir="auto">
                {row()?.name}
              </span>
              <span data-slot="lane-chip-row-end">
                <span data-slot="lane-chip-row-status" dir="auto">
                  {row()?.status}
                </span>
                <span data-slot="lane-chip-row-action" ref={notTabStop} onClick={(event) => event.stopPropagation()}>
                  <props.ui.IconButton
                    size="small"
                    variant="ghost-muted"
                    icon="outline-xmark"
                    label={`${props.actionLabel}: ${row()?.name ?? ""}`}
                    onClick={(event) => {
                      const item = rowOf(event.currentTarget as HTMLElement)
                      const keyboard = event.detail === 0
                      if (item) afterAction(item, keyboard)
                      props.onAction(id, keyboard)
                    }}
                  />
                </span>
              </span>
            </li>
          )
        }}
      </For>
    </ul>
  )
}

/** The icon an `IconName` pill uses where the catalog has no clock (the pill API takes catalog names only): a rarely used one,
 * whose glyph this CSS hides and draws as the same clock `ClockIcon` is. Scoped to plugin pills, so no host chip is touched. */
export const CLOCK_PLACEHOLDER = "outline-rotate-clockwise" as const

const clockMask = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round'><circle cx='8' cy='8' r='6'/><path d='M8 4.5V8l2.5 1.5'/></svg>")`

const OURS = [HEARTBEAT_LIVE_PLACEHOLDER, HEARTBEAT_FLAT_PLACEHOLDER, CLOCK_PLACEHOLDER].map((name) => `[data-slot="session-plugin-pill"]:has(use[href$="icon-${name}"])`).join(", ")

export const laneChipCss = `
${spinnerCss}
${heartbeatIconCss}
${heartbeatChipCss}
${OURS} { transition-duration: 150ms; }
[data-slot="session-plugin-pill"]:has(use[href$="icon-${CLOCK_PLACEHOLDER}"]) > svg { display: none; }
[data-slot="session-plugin-pill"]:has(use[href$="icon-${CLOCK_PLACEHOLDER}"])::before { content: ""; flex: none; width: 14px; height: 14px; background: var(--v2-icon-icon-muted); -webkit-mask: ${clockMask} center / 14px 14px no-repeat; mask: ${clockMask} center / 14px 14px no-repeat; }
[data-composer-pill-panel][data-slot="session-plugin-pill-popover"] { animation: none; width: max-content; min-width: 240px; max-width: min(360px, 100vw - 56px); max-height: 270px; overflow-y: auto; }
[data-composer-pill-panel][data-slot="session-plugin-pill-popover"] > :not([data-lane-chip-rows]) { display: none; }
[data-popper-positioner]:has([data-slot="session-plugin-pill-popover"]) { z-index: 60 !important; }
[data-lane-chip-rows] { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; outline: none; }
[data-lane-chip-row] { flex: none; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; column-gap: 8px; height: 28px; padding: 0 6px; border-radius: 4px; cursor: default; user-select: none; outline: none; color: var(--v2-text-text-base); }
[data-lane-chip-row]:is(:hover, :focus-visible, :has(button:focus)) { background: var(--v2-overlay-simple-overlay-hover); }
[data-slot="lane-chip-row-icon"] { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: var(--v2-icon-icon-muted); }
[data-slot="lane-chip-row-name"] { min-width: 0; font-size: 13px; font-weight: 530; line-height: 16px; letter-spacing: -0.04px; color: var(--v2-text-text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; }
[data-slot="lane-chip-row-end"] { display: grid; align-items: center; justify-items: end; }
[data-slot="lane-chip-row-status"], [data-slot="lane-chip-row-action"] { grid-area: 1 / 1; }
[data-slot="lane-chip-row-status"] { font-size: 11px; font-weight: 440; line-height: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--v2-text-text-muted); }
/* opacity, not visibility: a button that is not rendered cannot take the focus the arrow keys give it. */
[data-slot="lane-chip-row-action"] { display: inline-flex; opacity: 0; }
[data-slot="lane-chip-row-action"] svg { width: 14px; height: 14px; }
[data-lane-chip-row]:is(:hover, :focus-visible, :has(button:focus)) [data-slot="lane-chip-row-action"] { opacity: 1; }
[data-lane-chip-row]:is(:hover, :focus-visible, :has(button:focus)) [data-slot="lane-chip-row-status"] { visibility: hidden; }
@media (hover: none) { [data-slot="lane-chip-row-action"] { opacity: 1; } [data-slot="lane-chip-row-status"] { visibility: hidden; } }
`
