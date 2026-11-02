import type { Context, MountedSession } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { chatCard, claimPad, dockState } from "./dock"
import { glide, present } from "./dock-motion"
import { runningSubagents } from "./agents"
import { SubagentsList } from "./panel"

type Ctx = Pick<Context, "ui" | "toast" | "layout">
type Input = { readonly session: MountedSession; readonly active: boolean }
export type Dock = {
  readonly visible: () => boolean
  readonly setVisible: (value: boolean) => void
}

const DOCK_ID = "agents-dock"
// Below this window width the chat has no room beside a 288px window (the host narrows its own panels there too).
const NARROW_BELOW = 900

const GAP = 8
// The badge shows at most this many; "99+" keeps it two glyphs wide.
const MAX_BADGE = 99

/**
 * The header toggle for a session's subagents. With the right side panel closed it shows or hides the persistent floating
 * window (the dock, whose choice is stored); with it open it opens a transient popover under the button that closes on
 * outside click, Esc, or leaving the session.
 */
export function SubagentsToggle(props: { ctx: Ctx; input: Input; dock: Dock }) {
  const { ctx } = props
  const session = () => props.input.session
  const [open, setOpen] = createSignal(false)
  // Running subagents and background shells of the viewed session; a tab that is not on screen shows none.
  const count = createMemo(() => (props.input.active ? runningSubagents(session(), () => 0).length : 0))
  const label = () => (count() > 0 ? `Subagents · ${count()}` : "Subagents")
  // The host's own reactive answer for this session's right region, and a window too narrow for chat plus window.
  const sideOpen = () => props.ctx.layout.side.opened(session())
  const [narrow, setNarrow] = createSignal(window.innerWidth < NARROW_BELOW)
  const onResize = () => setNarrow(window.innerWidth < NARROW_BELOW)
  window.addEventListener("resize", onResize)
  onCleanup(() => window.removeEventListener("resize", onResize))
  const state = () => dockState({ enabled: true, sideOpen: sideOpen(), narrow: narrow(), visible: props.dock.visible() })

  // Opening the panel hides the window for good: the stored choice becomes hidden, so closing the panel starts without it.
  createEffect(() => {
    if (props.input.active && sideOpen()) props.dock.setVisible(false)
  })
  // The window lives in the chat card, which holds this header; it is resolved once the header is in the document.
  const [card, setCard] = createSignal<Element>()
  createEffect(() => {
    session().key
    queueMicrotask(() => setCard(chatCard(wrap)))
  })

  // Only a change of the window's shown state while this toggle is on screen with its card resolved is the user's doing
  // (the header button, or the right panel hiding the window). Everything else - load, reload, a tab or route mounting or
  // switching, a stored `visible`, the plugin re-mounting - is derived state: it appears final, with no glide, slide or
  // fade. Each effect decides from its own previous value, never from a flag another effect set, because the order
  // effects re-run in is not fixed.
  //
  // The chat reserves the window's width while the card carries this attribute (see the dock rules in panel.tsx). An
  // attribute restyles only the few elements its rules name; a custom property would restyle the whole card subtree. It
  // changes once: the content glides to its new place with a Web Animation (see dock-motion.ts), but only when the inset
  // changes on the card this toggle already holds. The card is shared by every session's toggle (see claimPad), so this
  // toggle only holds and drops its own claim.
  const owner = {}
  let held: Element | undefined
  let heldInset = 0
  const release = () => {
    if (held) claimPad(held, owner, 0).write()
    held = undefined
  }
  onCleanup(release)
  createEffect(() => {
    const target = props.input.active ? card() : undefined
    const next = state().inset
    if (!target) return release()
    if (held && held !== target) release()
    const claim = claimPad(target, owner, next)
    const play = held && next !== heldInset ? glide(target, claim.after - claim.before) : undefined
    claim.write()
    held = target
    heldInset = next
    play?.()
  })

  // The window mounts only while it is shown or leaving, so a hidden dock costs no second list or clock. On a user change
  // it enters and leaves with a Web Animation started as it mounts or as it is hidden; as derived state it just is there
  // (or just is gone).
  const [mounted, setMounted] = createSignal(state().shown)
  const [dock, setDock] = createSignal<HTMLElement>()
  const seen = new WeakSet<HTMLElement>()
  const onScreen = () => props.input.active && held !== undefined
  let opening = false
  createEffect(() => {
    if (state().shown) setMounted(true)
  })
  createEffect(
    on([dock, () => state().shown], ([el, shown], previous) => {
      const changed = previous !== undefined && previous[1] !== shown
      if (!el) {
        // The window is about to mount: remember whether the user asked for it.
        if (shown) return void (opening = changed && onScreen())
        opening = false
        return setMounted(false)
      }
      const fresh = !seen.has(el)
      seen.add(el)
      const animate = changed ? onScreen() : opening && shown
      opening = false
      if (!animate) return shown ? undefined : setMounted(false)
      const done = present(el, shown, fresh)
      if (!shown) void done.then(() => state().shown || setMounted(false))
    }),
  )

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
      <ctx.ui.Tooltip value={label()}>
        <span
          ref={wrap}
          data-agents-toggle
          data-agents-side={sideOpen() ? "open" : "closed"}
          data-agents-mode={state().docked ? "window" : "popover"}
          onMouseDown={(event) => event.preventDefault()}>
          <ctx.ui.IconButton
            icon="bullet-list"
            size="large"
            label={label()}
            pressed={state().docked ? state().shown : open()}
            onClick={() => (state().docked ? props.dock.setVisible(!props.dock.visible()) : setOpen((value) => !value))}
          />
          <Show when={count() > 0}>
            <span data-component="tag" data-variant="accent" data-appearance="compact" data-agents-badge aria-hidden="true">
              {count() > MAX_BADGE ? `${MAX_BADGE}+` : count()}
            </span>
          </Show>
        </span>
      </ctx.ui.Tooltip>
      <Show when={props.input.active && mounted() ? card() : undefined}>
        {(mount) => (
        <Portal mount={mount() as HTMLElement}>
          <div
            id={DOCK_ID}
            ref={setDock}
            data-agents-dock
            data-state={state().shown ? "open" : "closed"}
            role="region"
            aria-label="Subagents"
            inert={!state().shown}
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
