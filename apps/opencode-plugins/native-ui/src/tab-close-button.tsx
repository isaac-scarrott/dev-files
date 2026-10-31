import { children, onMount } from "solid-js"
import type { IconName, Ui } from "@opencode/plugin/gui"

// Host source: app/src/shell/titlebar/tab-nav.tsx (TabNavItem), the IconButton inside <div data-slot="tab-close">.
// The host styles it through `[data-titlebar-tab] [data-slot=tab-close]>button` (transition none, opacity 1 while the
// row is hovered, focused or editing) and `icon-button-v2[data-size=small][data-variant=ghost-muted]`.

export interface TabCloseButtonProps {
  ui: Ui
  label: string
  /** Defaults to the X. Any catalog icon keeps the button's size, colours and reveal. */
  icon?: IconName
  onClick(): void
}

/** The press neither focuses the button nor starts a drag, as the host's X does; it still bubbles like the host's. */
export const stopPress = (event: Event) => {
  event.preventDefault()
}

export function TabCloseButton(props: TabCloseButtonProps) {
  const node = children(() => (
    <props.ui.IconButton
      size="small"
      variant="ghost-muted"
      class="hover-reveal relative z-10"
      icon={props.icon ?? "xmark-small"}
      label={props.label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        props.onClick()
      }}
    />
  ))
  // ctx.ui.IconButton exposes no pointer handlers, so the host's onPointerDown is attached to the rendered button.
  onMount(() => {
    for (const el of node.toArray()) if (el instanceof HTMLElement) el.addEventListener("pointerdown", stopPress)
  })
  return <>{node()}</>
}
