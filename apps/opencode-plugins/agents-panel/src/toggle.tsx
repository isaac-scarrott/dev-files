import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { Portal, render } from "solid-js/web"
import { runningSubagents } from "./agents"
import { SubagentsList } from "./panel"

type Ctx = Pick<Context, "ui" | "tabs" | "toast" | "layout" | "storage">
type Input = { readonly session: MountedSession; readonly active: boolean }

const ROW = "[data-pane-row]"
const GAP = 8

/**
 * The header toggle for a session's subagents. With the host's right side panel closed it docks a column in the
 * timeline's row (the chat reflows and stays centred in the space left); with it open the same button opens the list
 * as a popover under the button.
 */
export function SubagentsToggle(props: { ctx: Ctx; input: Input }) {
  const { ctx } = props
  const session = () => props.input.session
  const [docked, setDocked] = ctx.storage.memory<{ keys: Record<string, boolean> }>("docked", { initial: { keys: {} } })
  const [popover, setPopover] = createSignal(false)
  const sideOpen = () => ctx.layout.side.opened(session())
  const dockOpen = () => !!docked.keys[session().key]
  const showDock = () => props.input.active && dockOpen() && !sideOpen()

  const count = () => (props.input.active ? runningSubagents(session(), () => 0).length : 0)
  const label = () => (count() > 0 ? `Subagents · ${count()}` : "Subagents")
  const pressed = () => (sideOpen() ? popover() : dockOpen())

  let marker!: HTMLSpanElement
  let wrap!: HTMLSpanElement
  let pop: HTMLDivElement | undefined
  const button = () => wrap.querySelector("button") ?? undefined

  const toggle = () => {
    if (sideOpen()) return setPopover((open) => !open)
    setDocked((draft) => {
      draft.keys[session().key] = !draft.keys[session().key]
    })
  }

  // Docking: the host has no registry for a column inside the timeline row, so the row gets a reserved end padding
  // and one absolutely placed host node. Both are removed with the effect.
  createEffect(() => {
    if (!showDock()) return
    let dispose: (() => void) | undefined
    let host: HTMLElement | undefined
    let row: Element | null = null
    let frame = 0
    let tries = 0
    const attach = () => {
      row = marker.closest(ROW)
      if (!row) {
        if (tries++ < 20) frame = requestAnimationFrame(attach)
        return
      }
      host = document.createElement("div")
      host.setAttribute("data-agents-dock", "")
      row.append(host)
      row.setAttribute("data-agents-docked", "")
      dispose = render(() => <SubagentsList ctx={ctx} session={session} />, host)
    }
    attach()
    onCleanup(() => {
      cancelAnimationFrame(frame)
      dispose?.()
      host?.remove()
      row?.removeAttribute("data-agents-docked")
    })
  })

  // The popover exists only while the side panel is open; closing the side panel or leaving the session closes it.
  createEffect(() => {
    if (!sideOpen() || !props.input.active) setPopover(false)
  })

  const place = () => {
    const anchor = button()?.getBoundingClientRect()
    if (!pop || !anchor) return
    pop.style.top = `${anchor.bottom + GAP}px`
    pop.style.right = `${Math.max(16, window.innerWidth - anchor.right)}px`
  }

  createEffect(() => {
    if (!popover()) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (pop?.contains(target) || wrap.contains(target)) return
      setPopover(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setPopover(false)
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
      <span ref={marker} hidden />
      <ctx.ui.Tooltip value={label()}>
        <span ref={wrap} data-agents-toggle>
          <ctx.ui.IconButton
            icon="bullet-list"
            size="large"
            label={label()}
            pressed={pressed()}
            onClick={toggle}
          />
          <Show when={count() > 0}>
            <span data-agents-badge>{count()}</span>
          </Show>
        </span>
      </ctx.ui.Tooltip>
      <Show when={popover()}>
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
