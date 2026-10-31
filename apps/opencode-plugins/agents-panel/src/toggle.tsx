import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { runningSubagents } from "./agents"
import { SubagentsList } from "./panel"

type Ctx = Pick<Context, "ui" | "tabs" | "toast">
type Input = { readonly session: MountedSession; readonly active: boolean }

const GAP = 8

/**
 * The header toggle for a session's subagents: one floating popover under the button, whatever the side panel does.
 * The popover is transient (it closes on outside click, Esc, or leaving the session), so nothing is stored.
 */
export function SubagentsToggle(props: { ctx: Ctx; input: Input }) {
  const { ctx } = props
  const session = () => props.input.session
  const [open, setOpen] = createSignal(false)

  const count = () => (props.input.active ? runningSubagents(session(), () => 0).length : 0)
  const label = () => (count() > 0 ? `Subagents · ${count()}` : "Subagents")

  let wrap!: HTMLSpanElement
  let pop: HTMLDivElement | undefined
  const button = () => wrap.querySelector("button") ?? undefined

  createEffect(() => {
    if (!props.input.active) setOpen(false)
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
    const expanded = open()
    trigger.setAttribute("aria-haspopup", "dialog")
    trigger.setAttribute("aria-expanded", String(expanded))
    trigger.toggleAttribute("data-expanded", expanded)
    onCleanup(() => {
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
      <ctx.ui.Tooltip value={label()}>
        <span ref={wrap} data-agents-toggle>
          <ctx.ui.IconButton
            icon="bullet-list"
            size="large"
            label={label()}
            pressed={open()}
            onClick={() => setOpen((value) => !value)}
          />
          <Show when={count() > 0}>
            <span data-agents-badge>{count()}</span>
          </Show>
        </span>
      </ctx.ui.Tooltip>
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
