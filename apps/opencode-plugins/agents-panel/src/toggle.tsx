import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { chatCard, dockState, type Sidebar } from "./dock"
import { SubagentsList } from "./panel"

type Ctx = Pick<Context, "ui" | "toast">
type Input = { readonly session: MountedSession; readonly active: boolean }
export type Dock = {
  readonly sidebar: () => Sidebar
  readonly asideWidth: () => number | undefined
  readonly visible: () => boolean
  readonly setVisible: (value: boolean) => void
}

const DOCK_ID = "agents-dock"
// The window's exit transition (transform 250ms) plus a frame.
const DOCK_EXIT_MS = 270

const GAP = 8

/**
 * The header toggle for a session's subagents. With the left sidebar open it shows or hides the persistent floating
 * window (the dock, whose choice is stored); otherwise it opens a transient popover under the button that closes on
 * outside click, Esc, or leaving the session.
 */
export function SubagentsToggle(props: { ctx: Ctx; input: Input; dock: Dock }) {
  const { ctx } = props
  const session = () => props.input.session
  const [open, setOpen] = createSignal(false)
  const state = () => dockState({ enabled: true, sidebar: props.dock.sidebar(), visible: props.dock.visible() })

  // The window mounts only while it is shown or leaving, so a hidden dock costs no second list or clock. It opens a frame
  // after mounting so the entrance transitions, except when it is already shown at load.
  const [mounted, setMounted] = createSignal(state().shown)
  const [windowOpen, setWindowOpen] = createSignal(state().shown)
  createEffect(() => {
    if (state().shown) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setWindowOpen(true))
      onCleanup(() => cancelAnimationFrame(frame))
      return
    }
    setWindowOpen(false)
    const timer = setTimeout(() => setMounted(false), DOCK_EXIT_MS)
    onCleanup(() => clearTimeout(timer))
  })

  // The window lives in the chat card, which holds this header; it is resolved once the header is in the document.
  const [card, setCard] = createSignal<Element>()
  createEffect(() => {
    session().key
    queueMicrotask(() => setCard(chatCard(wrap)))
  })

  let wrap!: HTMLSpanElement
  let pop: HTMLDivElement | undefined
  const button = () => wrap.querySelector("button") ?? undefined

  createEffect(() => {
    if (!props.input.active || state().docked) setOpen(false)
  })
  // Another session's list must not stay open under this button.
  createEffect(() => {
    session().key
    setOpen(false)
  })

  // The host's popover triggers carry aria-expanded and data-expanded; its ghost-muted pressed look keys on them (hover
  // would otherwise win over data-state=pressed), so the button wears them while the popover is open.
  createEffect(() => {
    const trigger = button()
    if (!trigger) return
    const docked = state().docked
    const expanded = docked ? state().shown : open()
    if (docked) trigger.setAttribute("aria-controls", DOCK_ID)
    else trigger.setAttribute("aria-haspopup", "dialog")
    trigger.setAttribute("aria-expanded", String(expanded))
    trigger.toggleAttribute("data-expanded", expanded)
    onCleanup(() => {
      trigger.removeAttribute("aria-controls")
      trigger.removeAttribute("aria-haspopup")
      trigger.removeAttribute("aria-expanded")
      trigger.removeAttribute("data-expanded")
    })
  })

  const place = () => {
    const anchor = button()?.getBoundingClientRect()
    if (!pop || !anchor) return
    pop.style.top = `${anchor.bottom + GAP}px`
    pop.style.right = `${Math.max(16, window.innerWidth - anchor.right)}px`
  }

  createEffect(() => {
    if (!open()) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (pop?.contains(target) || wrap.contains(target)) return
      setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setOpen(false)
      button()?.focus()
    }
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("keydown", escape, true)
    window.addEventListener("resize", place)
    onCleanup(() => {
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("keydown", escape, true)
      window.removeEventListener("resize", place)
    })
    queueMicrotask(() => {
      place()
      pop?.focus({ preventScroll: true })
    })
  })

  return (
    <>
      <ctx.ui.Tooltip value="Subagents">
        <span
          ref={wrap}
          data-agents-toggle
          data-agents-sidebar={props.dock.sidebar()}
          data-agents-aside-width={props.dock.asideWidth()}
          data-agents-mode={state().docked ? "window" : "popover"}
          onMouseDown={(event) => event.preventDefault()}>
          <ctx.ui.IconButton
            icon="bullet-list"
            size="large"
            label="Subagents"
            pressed={state().docked ? state().shown : open()}
            onClick={() => (state().docked ? props.dock.setVisible(!props.dock.visible()) : setOpen((value) => !value))}
          />
        </span>
      </ctx.ui.Tooltip>
      <Show when={props.input.active && mounted() ? card() : undefined}>
        {(mount) => (
        <Portal mount={mount() as HTMLElement}>
          <div
            id={DOCK_ID}
            data-agents-dock
            data-state={windowOpen() && state().shown ? "open" : "closed"}
            role="region"
            aria-label="Subagents"
            inert={!(windowOpen() && state().shown)}
          >
            <div data-component="menu-v2-content">
              <SubagentsList ctx={ctx} session={session} />
            </div>
          </div>
        </Portal>
        )}
      </Show>
      <Show when={open()}>
        <Portal>
          <div ref={pop} data-agents-popover tabIndex={-1} data-prevent-autofocus aria-label="Subagents">
            <div data-component="menu-v2-content">
              <SubagentsList ctx={ctx} session={session} />
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
