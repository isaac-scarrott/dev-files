import { For, type JSX } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"

// The rows inside a composer chip's popover. The host's popover (`[data-composer-pill-panel]`, 320px, 4px padding) is the
// shell; each row is laid out on the host menu item's own grid (16px glyph, 8px gap, 13px/440 text, the overlay-hover
// token on hover) but is two lines tall, so it is not a `menu-v2-item`, whose height is fixed at 28px. The Stop action is the
// host's IconButton (small, ghost-muted, outline-xmark), revealed on hover or focus as the host's activity rows reveal theirs.

export interface LaneChipRow {
  id: string
  name: string
  /** One muted line under the name. */
  status: string
}

export interface LaneChipRowsProps {
  ui: Ui
  rows: readonly LaneChipRow[]
  /** The row's glyph. */
  icon: () => JSX.Element
  /** Accessible name of each row's action, e.g. "Stop monitor". */
  actionLabel: string
  /** `keyboard` is true when Enter or Space pressed the action (a click's `detail` is 0), so focus can follow the keyboard user. */
  onAction(id: string, keyboard: boolean): void
}

/** After an action, focus goes to the next row's action (or the previous), so keyboard use never lands on the page. */
function refocus(row: HTMLElement) {
  const sibling = (row.nextElementSibling ?? row.previousElementSibling) as HTMLElement | null
  sibling?.querySelector<HTMLElement>("button")?.focus()
}

export function LaneChipRows(props: LaneChipRowsProps) {
  return (
    <ul data-lane-chip-rows role="list">
      <For each={props.rows}>
        {(row) => (
          <li data-lane-chip-row>
            <span data-slot="lane-chip-row-icon" aria-hidden="true">
              {props.icon()}
            </span>
            <span data-slot="lane-chip-row-text">
              <span data-slot="lane-chip-row-name" dir="auto">
                {row.name}
              </span>
              <span data-slot="lane-chip-row-status" dir="auto">
                {row.status}
              </span>
            </span>
            <span data-slot="lane-chip-row-action" onClick={(event) => event.stopPropagation()}>
              <props.ui.IconButton
                size="small"
                variant="ghost-muted"
                icon="outline-xmark"
                label={`${props.actionLabel}: ${row.name}`}
                onClick={(event) => {
                  const item = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-lane-chip-row]")
                  if (item) refocus(item)
                  props.onAction(row.id, event.detail === 0)
                }}
              />
            </span>
          </li>
        )}
      </For>
    </ul>
  )
}

/** The icon an `IconName` pill uses where the catalog has no clock (the pill API takes catalog names only): a rarely used one,
 * whose glyph this CSS hides and draws as the same clock `ClockIcon` is. Scoped to plugin pills, so no host chip is touched. */
export const CLOCK_PLACEHOLDER = "outline-rotate-clockwise" as const

const clockMask = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round'><circle cx='8' cy='8' r='6'/><path d='M8 4.5V8l2.5 1.5'/></svg>")`

const OURS = ["outline-console", CLOCK_PLACEHOLDER].map((name) => `[data-slot="session-plugin-pill"]:has(use[href$="icon-${name}"])`).join(", ")

export const laneChipCss = `
${OURS} { transition-duration: 150ms; }
[data-slot="session-plugin-pill"]:has(use[href$="icon-${CLOCK_PLACEHOLDER}"]) > svg { display: none; }
[data-slot="session-plugin-pill"]:has(use[href$="icon-${CLOCK_PLACEHOLDER}"])::before { content: ""; flex: none; width: 14px; height: 14px; background: var(--v2-icon-icon-muted); -webkit-mask: ${clockMask} center / 14px 14px no-repeat; mask: ${clockMask} center / 14px 14px no-repeat; }
[data-lane-chip-rows] { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 270px; overflow-y: auto; }
[data-lane-chip-row] { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; column-gap: 8px; padding: 4px 6px; border-radius: 4px; min-height: 28px; font-variant-numeric: tabular-nums; color: var(--v2-text-text-base); }
[data-lane-chip-row]:is(:hover, :focus-within) { background: var(--v2-overlay-simple-overlay-hover); }
[data-slot="lane-chip-row-icon"] { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; color: var(--v2-icon-icon-muted); }
[data-slot="lane-chip-row-text"] { display: flex; flex-direction: column; min-width: 0; text-align: start; }
[data-slot="lane-chip-row-name"] { font-size: 13px; font-weight: 530; line-height: var(--line-height-compact); letter-spacing: -0.04px; color: var(--v2-text-text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-slot="lane-chip-row-status"] { font-size: 13px; font-weight: 440; line-height: var(--line-height-compact); letter-spacing: -0.04px; color: var(--v2-text-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-slot="lane-chip-row-action"] { display: inline-flex; opacity: 0; }
[data-lane-chip-row]:is(:hover, :focus-within) [data-slot="lane-chip-row-action"] { opacity: 1; }
@media (hover: none) { [data-slot="lane-chip-row-action"] { opacity: 1; } [data-lane-chip-row] { min-height: 44px; } }
`
