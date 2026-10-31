import { children, createEffect, type JSX } from "solid-js"
import type { IconName, Ui } from "@opencode/plugin/gui"

// Host source: gui-plugins/src/details/popover.tsx (DetailsPopover trigger) and
// app/src/session/header/session-header-actions.tsx: Tooltip placed below, IconButton ghost-muted large "shrink-0".
// A trigger that opens a popover carries aria-haspopup, aria-expanded, aria-controls, data-expanded and
// data-state=pressed while it is open, as Kobalte's Popover.Trigger sets them.

export interface HeaderIconButtonProps {
  ui: Ui
  icon: IconName
  label: string
  /** Tooltip body; defaults to the label. */
  tooltip?: JSX.Element
  keys?: readonly string[]
  onClick(event: MouseEvent): void
  disabled?: boolean
  /** Set when the button opens a popover: pressed look plus aria-haspopup and aria-expanded. */
  expanded?: boolean
  haspopup?: "dialog" | "menu"
  /** The id of the popover the button controls, set while it is open. */
  controls?: string
  ref?(el: HTMLButtonElement): void
}

const guarded = new WeakSet<HTMLElement>()

export function HeaderIconButton(props: HeaderIconButtonProps) {
  const node = children(() => (
    <props.ui.IconButton
      variant="ghost-muted"
      size="large"
      class="shrink-0"
      icon={props.icon}
      label={props.label}
      disabled={props.disabled}
      onClick={(event) => props.onClick(event)}
    />
  ))
  createEffect(() => {
    const el = node.toArray().find((el): el is HTMLButtonElement => el instanceof HTMLButtonElement)
    if (!el) return
    props.ref?.(el)
    // The host's header buttons (Kobalte popover triggers) prevent pointerdown, so a press leaves focus where it is.
    if (!guarded.has(el)) {
      guarded.add(el)
      el.addEventListener("pointerdown", (event) => event.preventDefault())
    }
    if (props.expanded === undefined) return
    el.setAttribute("aria-haspopup", props.haspopup ?? "dialog")
    el.setAttribute("aria-expanded", String(props.expanded))
    el.toggleAttribute("data-expanded", props.expanded)
    if (props.expanded) el.setAttribute("data-state", "pressed")
    else el.removeAttribute("data-state")
    if (props.expanded && props.controls) el.setAttribute("aria-controls", props.controls)
    else el.removeAttribute("aria-controls")
  })
  return (
    <props.ui.Tooltip placement="bottom" value={props.tooltip ?? props.label} keys={props.keys}>
      {node()}
    </props.ui.Tooltip>
  )
}
