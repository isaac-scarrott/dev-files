import { createEffect, onCleanup, onMount, type JSX, type ParentProps } from "solid-js"
import { Portal } from "solid-js/web"

// Host source: gui-plugins/src/details/popover.tsx (DetailsPopover): a Kobalte Popover whose content is a role=dialog
// shell, placed bottom-end of an invisible anchor at the header's end (gutter 8, overflow padding 16), holding
// [data-component=session-summary-panel] cards (see summary.tsx). Kobalte positions the content; this shell does the
// same arithmetic with a fixed box. A context menu opened at a point uses the menu-v2-content surface (menu.tsx).

export interface PopoverProps {
  /** The element the card hangs under (its bottom edge plus the gutter), or a point (a context menu at the pointer). */
  anchor: HTMLElement | { x: number; y: number }
  /** The element whose end edge the card's end aligns to; the host's details popover aligns to the header actions, not its button. */
  end?: HTMLElement
  label: string
  onClose(): void
  placement?: "bottom-end" | "bottom-start"
  gutter?: number
  overflowPadding?: number
  /** The card: the host's summary panel (header popovers) or a bare shell for menu-v2-content children (context menus). */
  surface?: "summary" | "none"
  /** Focus the card itself on open (pointer open); keyboard opens focus the first focusable child; none leaves focus alone. */
  focus?: "card" | "first" | "none"
  id?: string
  ref?(el: HTMLDivElement): void
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="menuitem"]'

export function Popover(props: ParentProps<PopoverProps>) {
  let root!: HTMLDivElement
  let previous: Element | null = null
  const point = () => !(props.anchor instanceof HTMLElement)
  const rect = () => (props.anchor instanceof HTMLElement ? props.anchor.getBoundingClientRect() : { left: props.anchor.x, right: props.anchor.x, bottom: props.anchor.y })
  const inAnchor = (t: Node) => props.anchor instanceof HTMLElement && props.anchor.contains(t)
  const place = () => {
    const a = rect()
    const pad = props.overflowPadding ?? 16
    const gutter = point() ? 0 : props.gutter ?? 8
    const width = root.offsetWidth
    const endEdge = props.end?.getBoundingClientRect().right ?? a.right
    const left = (props.placement ?? (point() ? "bottom-start" : "bottom-end")) === "bottom-end" ? endEdge - width : a.left
    root.style.top = `${Math.min(a.bottom + gutter, window.innerHeight - root.offsetHeight - pad)}px`
    root.style.left = `${Math.max(pad, Math.min(left, window.innerWidth - width - pad))}px`
  }
  onMount(() => {
    previous = document.activeElement
    props.ref?.(root)
    place()
    const target = props.focus === "first" ? root.querySelector<HTMLElement>(FOCUSABLE) ?? root : root
    if (props.focus !== "none") target.focus({ preventScroll: true })
    const onPointer = (event: PointerEvent) => {
      const t = event.target
      if (!(t instanceof Node) || root.contains(t) || inAnchor(t)) return
      props.onClose()
    }
    const onResize = () => place()
    document.addEventListener("pointerdown", onPointer, true)
    window.addEventListener("resize", onResize)
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointer, true)
      window.removeEventListener("resize", onResize)
      // Focus returns to the trigger, as Kobalte's onCloseAutoFocus does.
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    })
  })
  createEffect(() => {
    props.surface
    place()
  })
  // Rendered through a portal into <body>, as Kobalte's popovers are: a plugin's own mount point may sit inside a host
  // box with `contain: strict` or `overflow: hidden` (the vertical-tabs mount is one), which clips a fixed box
  // out of sight and out of hit-testing while its rect still reports the intended place.
  return (
    <Portal mount={document.body}>
    <div
      ref={root}
      role="dialog"
      id={props.id}
      aria-label={props.label}
      tabindex="-1"
      data-expanded=""
      data-component="popover-shell"
      // The host's details CSS is scoped under .session-summary-popover; a bare shell (a context menu) carries no class.
      class={props.surface === "none" ? "z-50 border-0 bg-transparent outline-none" : "session-summary-popover z-50 border-0 bg-transparent outline-none"}
      style={{ position: "fixed", "pointer-events": "auto" }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        event.stopPropagation()
        props.onClose()
      }}
    >
      {props.surface === "none" ? props.children : <div data-component="session-summary-panel">{props.children}</div>}
    </div>
    </Portal>
  )
}

export const popoverCss = `[data-component=popover-shell] > [data-component=menu-v2-content] { position: static; }`

export type { JSX }
