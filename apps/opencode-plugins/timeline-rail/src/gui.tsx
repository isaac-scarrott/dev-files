import { Plugin, Slot, Style, type SlotMap } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack } from "solid-js"
import { Portal } from "solid-js/web"
import { loadHistory, type HistoryHost } from "./history"
import { currentIndex, inset, jumpTo, type Host } from "./jump"
import { layout, prompts, tickOf, type Message, type Tick } from "./rail"
import { tweenScroll } from "./tween"

/** The rail's column, ticks included; it sits centred in the gutter left of the timeline column. */
const RAIL_WIDTH = 28
/** Below this gutter the rail would sit over the column's own padding, so it hides. */
const MIN_GUTTER = 44
/** The host hides the session header under this width (`createMediaQuery` in `session/model.ts`). */
const DESKTOP = "(min-width: 768px)"
// The host's tooltip timings (`ui/src/overlays/tooltip/tooltip.tsx`: openDelay, skipDelayDuration, tooltipV2Out).
const OPEN_DELAY = 400
const SKIP_DELAY = 300
const CLOSE_MOTION = 90
/** Dock-like lift under a fine pointer: peak extra width of the nearest tick, and the falloff in px. */
const LIFT = 0.4
const REACH = 16
/** The current-position marker beside the ticks. */
const MARKER_HEIGHT = 8

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
  // A memo: the cursor changes with every page, and the history effect must rerun only when "more" itself flips.
  const more = createMemo(() => data().message.more(session().id))
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

  // When the user last scrolled, touched or typed in the timeline: the history loader waits for quiet.
  let lastInput = Number.NEGATIVE_INFINITY
  const idle = () => performance.now() - lastInput

  createEffect(() => {
    const root = scroller()

    if (!root) return
    const mark = () => void (lastInput = performance.now())
    const types = ["wheel", "touchstart", "touchmove", "pointerdown", "keydown"] as const

    for (const type of types) root.addEventListener(type, mark, { passive: true })
    onCleanup(() => {
      for (const type of types) root.removeEventListener(type, mark)
    })
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
      tween: (to, signal) => tweenScroll({ scroller: root, frame, now: () => performance.now() }, to, signal),
    }
  }

  // The whole conversation, behind the user: ticks and jumps must cover history the host has not paged in. One
  // page per request, each after the user holds still for a beat; aborted on deactivation, session switch and unmount.
  const [paging, setPaging] = createSignal(false)

  const active = createMemo(() => props.input.active)

  createEffect(() => {
    const root = scroller()

    if (!root || !active() || !more()) return
    const controller = new AbortController()
    const target: HistoryHost = {
      scroller: root,
      more: () => data().message.more(session().id),
      loadMore: ({ signal, beforePublish }) => data().message.loadMore(session().id, { signal, beforePublish }),
      frame,
      idle,
      inset: () => inset(root),
      loading: setPaging,
      drift: (globalThis as { __timelineRailDrift?: (px: number) => void }).__timelineRailDrift,
    }

    // Untracked: the loader's own reads of the cursor would otherwise restart it after every page.
    void untrack(() => loadHistory(target, controller.signal))
    onCleanup(() => {
      controller.abort()
      setPaging(false)
    })
  })

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
  // keyboard focus. Once open it stays mounted and glides between ticks instead of popping again.
  const [hover, setHover] = createSignal<number>()
  const [phase, setPhase] = createSignal<"closed" | "open" | "closing">("closed")
  const [entered, setEntered] = createSignal(false)
  const [focused, setFocused] = createSignal<number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let closedAt = Number.NEGATIVE_INFINITY

  const arm = (index: number, now = false) => {
    setHover(index)

    if (phase() === "open") return
    clearTimeout(timer)

    if (phase() === "closing" || now || Date.now() - closedAt < SKIP_DELAY) {
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

  // The first frame of a card is its closed look; the next flips it, so the browser has a transition to run.
  createEffect(() => {
    if (phase() !== "open") {
      setEntered(false)

      return
    }
    const id = requestAnimationFrame(() => setEntered(true))
    onCleanup(() => cancelAnimationFrame(id))
  })

  const cardTick = createMemo(() => {
    const index = hover()

    return index === undefined || phase() === "closed" ? undefined : plan().ticks[index]
  })
  const cardPrompt = () => {
    const tick = cardTick()

    return tick ? list()[tick.start] : undefined
  }
  const cardMeta = () => {
    const tick = cardTick()

    if (!tick || more() || paging()) return undefined

    return tick.end > tick.start ? `${tick.start + 1}–${tick.end + 1} of ${list().length}` : `${tick.start + 1} of ${list().length}`
  }

  const label = (tick: Tick) => {
    const prompt = list()[tick.start]

    if (!prompt) return ""

    return tick.end > tick.start ? `${prompt.title} (and ${tick.end - tick.start} more)` : prompt.title
  }

  const tabbable = () => focused() ?? Math.max(0, activeTick())

  let container: HTMLDivElement | undefined
  let ticksElement: HTMLDivElement | undefined
  let cardElement: HTMLDivElement | undefined
  const [cardTop, setCardTop] = createSignal(0)
  const [cardOrigin, setCardOrigin] = createSignal(0)
  const [armed, setArmed] = createSignal(false)

  const buttons = () => (container ? [...container.querySelectorAll<HTMLButtonElement>("[data-timeline-rail-tick]")] : [])

  // Placed once the card has its size, before paint: Solid runs this after the DOM updates of the same tick.
  createEffect(() => {
    const tick = cardTick()
    const prompt = cardPrompt()
    const index = hover()

    if (!tick || !prompt || index === undefined || !container || !cardElement) return
    const button = buttons()[index]

    if (!button) return
    const box = container.getBoundingClientRect()
    const own = button.getBoundingClientRect()
    const centre = own.top + own.height / 2 - box.top
    const height = cardElement.offsetHeight
    const top = Math.round(Math.max(0, Math.min(centre - height / 2, box.height - height)))
    setCardTop(top)
    setCardOrigin(Math.round(centre - top))
  })

  // Dock-like lift: ticks near a fine pointer widen. Ticks sit at a fixed pitch, so the maths needs one rect read.
  let lifting: number | undefined
  let pointerY = 0

  const lift = () => {
    lifting = undefined
    if (!ticksElement) return
    const top = ticksElement.getBoundingClientRect().top
    const pitch = plan().pitch

    buttons().forEach((button, index) => {
      const distance = pointerY - (top + (index + 0.5) * pitch)
      const k = 1 + LIFT * Math.exp(-(distance * distance) / (2 * REACH * REACH))

      if (k < 1.01) button.style.removeProperty("--k")
      else button.style.setProperty("--k", k.toFixed(3))
    })
  }

  const unlift = () => {
    if (lifting !== undefined) cancelAnimationFrame(lifting)
    lifting = undefined
    for (const button of buttons()) button.style.removeProperty("--k")
  }

  onCleanup(() => {
    if (lifting !== undefined) cancelAnimationFrame(lifting)
  })

  // The current-position marker slides between ticks when the user scrolls; when ticks reflow (a page of history
  // landed, the pane resized) it jumps instead, because the tick it marks moved under it.
  const [reflow, setReflow] = createSignal(false)
  let reflowFrame: number | undefined

  createEffect(
    on(
      () => `${plan().ticks.length}:${plan().pitch}:${geometry()?.height}`,
      () => {
        setReflow(true)
        if (reflowFrame !== undefined) cancelAnimationFrame(reflowFrame)
        reflowFrame = requestAnimationFrame(() => (reflowFrame = requestAnimationFrame(() => setReflow(false))))
      },
    ),
  )
  onCleanup(() => {
    if (reflowFrame !== undefined) cancelAnimationFrame(reflowFrame)
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
          : event.key === "PageDown"
            ? Math.min(all.length - 1, at + 5)
            : event.key === "PageUp"
              ? Math.max(0, at - 5)
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

  const markerY = () => Math.max(0, activeTick()) * plan().pitch + plan().pitch / 2 - MARKER_HEIGHT / 2

  return (
    <span ref={(el) => (element = el)} style={{ display: "contents" }}>
      <Show when={props.input.active && desktop() && geometry()?.show && view()}>
        {(mount) => (
          <Portal mount={mount()} ref={(el) => (el.style.display = "contents")}>
            <div
              ref={(el) => {
                container = el
                // No transitions on first paint: they switch on two frames after the rail exists.
                requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)))
              }}
              data-timeline-rail
              data-empty={list().length < 2 ? "" : undefined}
              data-armed={armed() ? "" : undefined}
              style={style()}
              onPointerLeave={() => {
                unlift()
                close()
              }}
              onKeyDown={keys}
              onFocusOut={(event) => {
                if (!(event.relatedTarget instanceof Node) || !container?.contains(event.relatedTarget)) {
                  setFocused(undefined)
                  close()
                }
              }}
            >
              <div
                ref={ticksElement}
                data-timeline-rail-ticks
                role="toolbar"
                aria-orientation="vertical"
                aria-label="Your prompts"
                aria-busy={loading() || paging() ? "true" : undefined}
                onPointerMove={(event) => {
                  if (event.pointerType === "touch") return

                  if (reducedMotion()) {
                    unlift()

                    return
                  }
                  pointerY = event.clientY
                  if (lifting === undefined) lifting = requestAnimationFrame(lift)
                }}
              >
                <span data-timeline-rail-history data-active={paging() ? "" : undefined} aria-hidden="true" />
                <span
                  data-timeline-rail-marker
                  data-reflow={reflow() ? "" : undefined}
                  data-hidden={activeTick() < 0 ? "" : undefined}
                  aria-hidden="true"
                  style={{ transform: `translateY(${markerY()}px)`, height: `${MARKER_HEIGHT}px` }}
                />
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
              <Show when={cardTick()}>
                <div
                  data-timeline-rail-card
                  data-entered={entered() ? "" : undefined}
                  style={{ "--card-y": `${cardTop()}px`, "--card-origin": `${cardOrigin()}px` }}
                >
                  <div ref={cardElement} data-timeline-rail-card-body role="tooltip">
                    <Show when={cardMeta()}>
                      <div data-timeline-rail-card-meta>{cardMeta()}</div>
                    </Show>
                    <div data-timeline-rail-card-title dir="auto">
                      {cardPrompt()?.title}
                    </div>
                    <Show when={cardPrompt()?.snippet || cardPrompt()?.working}>
                      <div data-timeline-rail-card-snippet dir="auto" data-working={cardPrompt()?.working ? "" : undefined}>
                        {cardPrompt()?.snippet ?? "Working…"}
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </Portal>
        )}
      </Show>
    </span>
  )
}

// Tokens and numbers copied from the host: the card is `menu-v2-content`'s surface (layer-01, floating elevation, 6px
// radius). Motion follows reference/animation.md: ease-out for entrances, the on-screen curve for the marker, only
// `transform` and `opacity`, nothing runs until `data-armed` (two frames after the rail exists, so nothing animates
// on first paint), and reduced motion keeps opacity and drops movement.
const CSS = `
[data-timeline-rail] {
  --timeline-rail-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --timeline-rail-move: cubic-bezier(0.77, 0, 0.175, 1);
  position: absolute;
  z-index: 55;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: ${RAIL_WIDTH}px;
  pointer-events: none;
}
[data-timeline-rail][data-empty] { opacity: 0; visibility: hidden; }
[data-timeline-rail][data-armed] { transition: opacity 200ms var(--timeline-rail-ease), visibility 0s; }
[data-timeline-rail][data-armed][data-empty] { transition: opacity 160ms var(--timeline-rail-ease), visibility 0s 160ms; }
[data-timeline-rail-ticks] {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 0 0 8px;
  box-sizing: border-box;
  pointer-events: auto;
}
[data-timeline-rail-history] {
  position: absolute;
  top: -9px;
  left: 8px;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--v2-text-text-faint);
  opacity: 0;
}
[data-timeline-rail][data-armed] [data-timeline-rail-history] { transition: opacity 200ms var(--timeline-rail-ease); }
[data-timeline-rail-history][data-active] { opacity: 1; animation: timelineRailHistory 1.4s ease-in-out infinite; }
[data-timeline-rail-marker] {
  position: absolute;
  top: 0;
  left: 3px;
  width: 2px;
  border-radius: 1px;
  background: var(--v2-text-text-base);
  pointer-events: none;
  will-change: transform;
}
[data-timeline-rail-marker][data-hidden] { opacity: 0; }
[data-timeline-rail][data-armed] [data-timeline-rail-marker]:not([data-reflow]) {
  transition: transform 180ms var(--timeline-rail-move), opacity 120ms var(--timeline-rail-ease);
}
[data-timeline-rail-tick] {
  appearance: none;
  position: relative;
  display: block;
  height: var(--timeline-rail-pitch, 10px);
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  outline: none;
}
[data-timeline-rail-tick]::before,
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  height: 2px;
  width: 6px;
  margin-top: -1px;
  border-radius: 1px;
  transform-origin: 0 50%;
  transform: scale(var(--k, 1), calc(1 + (var(--k, 1) - 1) * 1.2));
}
[data-timeline-rail-tick]::before { background: var(--v2-text-text-faint); }
[data-timeline-rail-tick]::after { background: var(--v2-text-text-base); opacity: 0; }
[data-timeline-rail-tick][data-length="medium"]::before, [data-timeline-rail-tick][data-length="medium"]::after { width: 10px; }
[data-timeline-rail-tick][data-length="long"]::before, [data-timeline-rail-tick][data-length="long"]::after { width: 14px; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after {
  transition: transform 110ms var(--timeline-rail-ease), opacity 120ms var(--timeline-rail-ease);
}
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-tick]:hover::after { opacity: 0.6; }
}
[data-timeline-rail-tick][data-current]::after { opacity: 1; }
[data-timeline-rail-tick]:focus-visible::before {
  outline: 2px solid var(--v2-border-border-focus);
  outline-offset: 2px;
}
[data-timeline-rail-card] {
  position: absolute;
  top: 0;
  left: ${RAIL_WIDTH}px;
  padding-left: 4px;
  pointer-events: auto;
  transform: translateY(var(--card-y, 0px));
}
[data-timeline-rail-card][data-entered] { transition: transform 140ms var(--timeline-rail-ease); }
[data-timeline-rail-card-body] {
  box-sizing: border-box;
  width: min(320px, 40vw);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-floating);
  color: var(--v2-text-text-base);
  opacity: 0;
  transform: scale(0.96);
  transform-origin: 0 var(--card-origin, 50%);
  transition: opacity 90ms var(--timeline-rail-ease), transform 90ms var(--timeline-rail-ease);
}
[data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] {
  opacity: 1;
  transform: none;
  transition: opacity 140ms var(--timeline-rail-ease), transform 140ms var(--timeline-rail-ease);
}
[data-timeline-rail-card-meta] {
  margin-bottom: 2px;
  font-size: 11px;
  line-height: 14px;
  font-weight: 440;
  letter-spacing: 0.05px;
  color: var(--v2-text-text-faint);
  font-variant-numeric: tabular-nums;
}
[data-timeline-rail-card-title] {
  font-size: 13px;
  line-height: 16px;
  font-weight: 530;
  letter-spacing: -0.04px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
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
@keyframes timelineRailHistory { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.9; } }
@media (prefers-reduced-motion: reduce) {
  [data-timeline-rail-history][data-active] { animation: none; opacity: 0.6; }
  [data-timeline-rail][data-armed] [data-timeline-rail-marker]:not([data-reflow]) { transition: opacity 120ms linear; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
  [data-timeline-rail-card][data-entered] { transition: none; }
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] { transform: none; transition: opacity 90ms linear; }
}
`

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, CSS)
    ctx.add(Slot, { at: "session.header", render: (input) => <Rail input={input} /> })
  },
})
