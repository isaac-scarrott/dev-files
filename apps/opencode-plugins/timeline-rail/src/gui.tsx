import { Plugin, Slot, Style, type SlotMap } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { currentIndex, inset, jumpTo, type Host } from "./jump"
import { layout, prompts, tickOf, type Message, type Tick } from "./rail"

/** The rail's column, ticks included; it sits centred in the gutter left of the timeline column. */
const RAIL_WIDTH = 28
/** Below this gutter the rail would sit over the column's own padding, so it hides. */
const MIN_GUTTER = 44
/** The host hides the session header under this width (`createMediaQuery` in `session/model.ts`). */
const DESKTOP = "(min-width: 768px)"
// The host's tooltip timings (`ui/src/overlays/tooltip/tooltip.tsx`: openDelay, skipDelayDuration, tooltipV2Out).
const OPEN_DELAY = 400
const SKIP_DELAY = 300
const CLOSE_MOTION = 80

type Geometry = { readonly top: number; readonly height: number; readonly left: number; readonly show: boolean }

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** The session view root: the element the scroller, the jump-to-latest pill and the visible-area box share. */
function viewOf(scroller: HTMLElement) {
  return scroller.closest("[data-slot='session-timeline-scroll']")?.parentElement ?? undefined
}

/**
 * Where the rail goes, in the view's coordinates: the visible timeline area under the sticky header, and the gutter
 * between the view's left edge and the centred column, measured from a mounted row (which follows the host's panel
 * motion) or from the column width token when no row is mounted.
 */
export function measure(scroller: HTMLElement, view: HTMLElement): Geometry {
  const box = view.getBoundingClientRect()
  const visible = view.querySelector("[data-slot='session-timeline-visible']")
  const area = visible instanceof HTMLElement ? visible.getBoundingClientRect() : box
  const row = scroller.querySelector("[data-timeline-row][data-message-id]")
  const column =
    row instanceof HTMLElement
      ? row.getBoundingClientRect().left
      : box.left + Math.max(0, (box.width - (parseFloat(window.getComputedStyle(view).getPropertyValue("--container-session")) || box.width)) / 2)
  const gutter = column - box.left
  const header = inset(scroller)

  return {
    top: area.top - box.top + header,
    height: Math.max(0, area.height - header),
    left: Math.round((gutter - RAIL_WIDTH) / 2),
    show: gutter >= MIN_GUTTER,
  }
}

function Rail(props: { input: SlotMap["session.header"] }) {
  const [scroller, setScroller] = createSignal<HTMLElement>()
  const [view, setView] = createSignal<HTMLElement>()
  const [geometry, setGeometry] = createSignal<Geometry>()
  const [current, setCurrent] = createSignal(-1)
  const [loading, setLoading] = createSignal(false)
  const [desktop, setDesktop] = createSignal(true)
  const session = () => props.input.session
  const data = () => session().server.data.session
  const list = createMemo(() =>
    prompts(data().message.list(session().id) as readonly Message[], data().get(session().id)?.revert?.messageID),
  )
  const ids = createMemo(() => list().map((prompt) => prompt.id))
  const more = () => data().message.more(session().id)
  const plan = createMemo(() => layout(list().length, geometry()?.height ?? 0))
  const activeTick = createMemo(() => tickOf(plan().ticks, current()))

  // The slot's element joins the timeline after it is created; the scroller is its nearest scrollable ancestor.
  let element: HTMLElement | undefined
  let locating: number | undefined
  const locate = (left: number) => {
    locating = undefined
    const root = element?.closest<HTMLElement>("[data-scrollable]")
    const parent = root && viewOf(root)

    if (root && parent) {
      setScroller(root)
      setView(parent)
    } else if (left > 0) locating = requestAnimationFrame(() => locate(left - 1))
  }

  onMount(() => locate(10))
  onCleanup(() => {
    if (locating !== undefined) cancelAnimationFrame(locating)
  })

  onMount(() => {
    if (typeof window.matchMedia !== "function") return
    const query = window.matchMedia(DESKTOP)
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    onCleanup(() => query.removeEventListener("change", update))
  })

  const host = (): Host | undefined => {
    const root = scroller()

    if (!root) return undefined

    return {
      scroller: root,
      ids,
      more,
      loadMore: (signal) => data().message.loadMore(session().id, { signal }),
      reducedMotion,
      frame,
      loading: setLoading,
    }
  }

  let pending: number | undefined

  const refresh = () => {
    pending = undefined
    const root = scroller()
    const parent = view()

    if (!props.input.active || !root || !parent) return
    // Reads only; Solid applies the writes after.
    const index = currentIndex({ scroller: root, ids })
    const box = measure(root, parent)
    setCurrent(index)
    setGeometry((previous) =>
      previous && previous.top === box.top && previous.height === box.height && previous.left === box.left && previous.show === box.show
        ? previous
        : box,
    )
  }

  const schedule = () => {
    if (pending !== undefined) return
    pending = requestAnimationFrame(refresh)
  }

  onCleanup(() => {
    if (pending !== undefined) cancelAnimationFrame(pending)
  })

  createEffect(() => {
    const root = scroller()
    const parent = view()

    if (!root || !parent) return
    root.addEventListener("scroll", schedule, { passive: true })
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : undefined
    observer?.observe(parent)
    const visible = parent.querySelector("[data-slot='session-timeline-visible']")

    if (visible) observer?.observe(visible)
    schedule()
    onCleanup(() => {
      root.removeEventListener("scroll", schedule)
      observer?.disconnect()
    })
  })

  createEffect(on([ids, more, () => props.input.active, desktop], schedule, { defer: true }))

  let inflight: AbortController | undefined

  const run = (index: number) => {
    const id = ids()[index]
    const target = host()

    if (!id || !target || !props.input.active) return
    inflight?.abort()
    const controller = new AbortController()
    inflight = controller
    void jumpTo(target, id, controller.signal).finally(() => {
      if (inflight === controller) inflight = undefined
      schedule()
    })
  }

  onCleanup(() => inflight?.abort())

  // The card follows the host's tooltip: a delay before the first open, instant while one just closed, instant on
  // keyboard focus, and an exit animation it stays mounted for.
  const [hover, setHover] = createSignal<number>()
  const [phase, setPhase] = createSignal<"closed" | "open" | "closing">("closed")
  const [focused, setFocused] = createSignal<number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let closedAt = Number.NEGATIVE_INFINITY

  const arm = (index: number, now = false) => {
    setHover(index)

    if (phase() === "open") return
    clearTimeout(timer)

    if (now || Date.now() - closedAt < SKIP_DELAY) {
      setPhase("open")

      return
    }
    timer = setTimeout(() => setPhase("open"), OPEN_DELAY)
  }

  const close = () => {
    clearTimeout(timer)
    timer = undefined

    if (phase() !== "open") {
      setPhase("closed")

      return
    }
    closedAt = Date.now()

    if (reducedMotion()) {
      setPhase("closed")

      return
    }
    setPhase("closing")
    timer = setTimeout(() => {
      if (phase() === "closing") setPhase("closed")
    }, CLOSE_MOTION)
  }

  onCleanup(() => clearTimeout(timer))

  const card = createMemo(() => {
    const index = hover()

    if (index === undefined || phase() === "closed") return undefined
    const tick = plan().ticks[index]

    return tick ? { tick, index, prompt: list()[tick.start]! } : undefined
  })

  const label = (tick: Tick) => {
    const prompt = list()[tick.start]

    if (!prompt) return ""

    return tick.end > tick.start ? `${prompt.title} (and ${tick.end - tick.start} more)` : prompt.title
  }

  const tabbable = () => focused() ?? Math.max(0, activeTick())

  let container: HTMLDivElement | undefined
  let cardElement: HTMLDivElement | undefined
  const [cardTop, setCardTop] = createSignal(0)

  const buttons = () => (container ? [...container.querySelectorAll<HTMLButtonElement>("[data-timeline-rail-tick]")] : [])

  // Placed once the card has its size, before paint: Solid runs this after the DOM updates of the same tick.
  createEffect(() => {
    const shown = card()

    if (!shown || !container || !cardElement) return
    const tick = buttons()[shown.index]

    if (!tick) return
    const box = container.getBoundingClientRect()
    const own = tick.getBoundingClientRect()
    const centre = own.top + own.height / 2 - box.top
    const height = cardElement.offsetHeight
    setCardTop(Math.round(Math.max(0, Math.min(centre - height / 2, box.height - height))))
  })

  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close()

      return
    }
    const all = buttons()

    if (all.length === 0) return
    const at = all.findIndex((button) => button === document.activeElement)
    const next =
      event.key === "ArrowDown"
        ? Math.min(all.length - 1, at + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, at - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? all.length - 1
              : -1

    if (next === -1) return
    event.preventDefault()
    all[next]?.focus()
  }

  const style = () => {
    const box = geometry()

    return {
      top: `${box?.top ?? 0}px`,
      height: `${box?.height ?? 0}px`,
      left: `${box?.left ?? 0}px`,
      "--timeline-rail-pitch": `${plan().pitch}px`,
    }
  }

  return (
    <span ref={(el) => (element = el)} style={{ display: "contents" }}>
      <Show when={props.input.active && desktop() && geometry()?.show && list().length >= 2 && view()}>
        {(mount) => (
          <Portal mount={mount()} ref={(el) => (el.style.display = "contents")}>
            <div
              ref={container}
              data-timeline-rail
              style={style()}
              onPointerLeave={close}
              onKeyDown={keys}
              onFocusOut={(event) => {
                if (!(event.relatedTarget instanceof Node) || !container?.contains(event.relatedTarget)) {
                  setFocused(undefined)
                  close()
                }
              }}
            >
              <div
                data-timeline-rail-ticks
                role="toolbar"
                aria-orientation="vertical"
                aria-label="Your prompts"
                aria-busy={loading() ? "true" : undefined}
              >
                <For each={plan().ticks}>
                  {(tick, index) => (
                    <button
                      type="button"
                      data-timeline-rail-tick
                      data-length={list()[tick.start]?.length}
                      data-current={activeTick() === index() ? "" : undefined}
                      aria-current={activeTick() === index() ? "true" : undefined}
                      aria-label={label(tick)}
                      tabIndex={tabbable() === index() ? 0 : -1}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "touch") arm(index())
                      }}
                      onFocus={(event) => {
                        setFocused(index())

                        if (event.currentTarget.matches(":focus-visible")) arm(index(), true)
                      }}
                      onClick={() => run(tick.start)}
                    />
                  )}
                </For>
              </div>
              <Show when={card()}>
                {(shown) => (
                  <div
                    data-timeline-rail-card
                    data-closed={phase() === "closing" ? "" : undefined}
                    style={{ top: `${cardTop()}px` }}
                  >
                    <div ref={cardElement} data-timeline-rail-card-body role="tooltip">
                      <div data-timeline-rail-card-title dir="auto">
                        {shown().prompt.title}
                      </div>
                      <Show when={shown().prompt.snippet || shown().prompt.working}>
                        <div data-timeline-rail-card-snippet dir="auto" data-working={shown().prompt.working ? "" : undefined}>
                          {shown().prompt.snippet ?? "Working…"}
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </Portal>
        )}
      </Show>
    </span>
  )
}

// Tokens and numbers copied from the host: ticks use the text scale (faint → muted → base), the card is
// `menu-v2-content`'s surface (layer-01, floating elevation, 6px radius) with the tooltip's enter/exit motion.
const CSS = `
[data-timeline-rail] {
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${RAIL_WIDTH}px;
  pointer-events: none;
}
[data-timeline-rail-ticks] {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 0 0 8px;
  box-sizing: border-box;
  pointer-events: auto;
}
[data-timeline-rail-ticks][aria-busy="true"] { opacity: 0.6; }
[data-timeline-rail-tick] {
  appearance: none;
  display: flex;
  align-items: center;
  height: var(--timeline-rail-pitch, 10px);
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  outline: none;
}
[data-timeline-rail-tick]::before {
  content: "";
  display: block;
  height: 2px;
  width: 6px;
  border-radius: 1px;
  background: var(--v2-text-text-faint);
  transition: background-color 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
[data-timeline-rail-tick][data-length="medium"]::before { width: 10px; }
[data-timeline-rail-tick][data-length="long"]::before { width: 14px; }
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-tick]:hover::before { background: var(--v2-text-text-muted); }
}
[data-timeline-rail-tick][data-current]::before { background: var(--v2-text-text-base); }
[data-timeline-rail-tick]:focus-visible::before {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 2px;
}
[data-timeline-rail-card] {
  position: absolute;
  left: ${RAIL_WIDTH}px;
  padding-left: 4px;
  pointer-events: auto;
}
[data-timeline-rail-card-body] {
  box-sizing: border-box;
  width: min(320px, 40vw);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-floating);
  color: var(--v2-text-text-base);
  transform-origin: left center;
  animation: 0.12s ease-out timelineRailCardIn;
}
[data-timeline-rail-card][data-closed] [data-timeline-rail-card-body] { animation: 80ms ease-in forwards timelineRailCardOut; }
[data-timeline-rail-card-title] {
  font-size: 13px;
  line-height: 16px;
  font-weight: 530;
  letter-spacing: -0.04px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-timeline-rail-card-snippet] {
  margin-top: 4px;
  font-size: 11px;
  line-height: 14px;
  font-weight: 440;
  letter-spacing: 0.05px;
  color: var(--v2-text-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
[data-timeline-rail-card-snippet][data-working] { color: var(--v2-text-text-faint); }
@keyframes timelineRailCardIn { 0% { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes timelineRailCardOut { 0% { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.96); } }
@media (prefers-reduced-motion: reduce) {
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-closed] [data-timeline-rail-card-body] { animation: none; }
  [data-timeline-rail-tick]::before { transition: none; }
}
`

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, CSS)
    ctx.add(Slot, { at: "session.header", render: (input) => <Rail input={input} /> })
  },
})
