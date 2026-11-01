import { Plugin, Slot, Style, type SlotMap, type Ui } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js"
import { Portal } from "solid-js/web"
import { loadHistory, type HistoryHost } from "./history"
import { inset, jumpTo, readRows, unpin, type Host } from "./jump"
import { indexFromPointer, MIN_ITEMS, prompts, railHeightStyle, topPercent, visibleRange, type Message } from "./rail"
import { createStrip } from "./strip"
import { currentPrompt } from "./target"
import { tweenScroll } from "./tween"

/** The rail's column, ticks included; it hugs the left edge of the view. */
const RAIL_WIDTH = 28
/** The rail hugs the view's left edge, this far in, and only moves toward the column when the gutter is too narrow. */
const EDGE_INSET = 6
/** Below this gutter the rail would sit over the column's own padding, so it hides. */
const MIN_GUTTER = 44
/** The host hides the session header under this width (`createMediaQuery` in `session/model.ts`). */
const DESKTOP = "(min-width: 768px)"
// The host's tooltip timings (`ui/src/overlays/tooltip/tooltip.tsx`: openDelay, skipDelayDuration, tooltipV2Out).
const OPEN_DELAY = 400
const SKIP_DELAY = 300
const CLOSE_MOTION = 90
/** Previous / next turn by this many prompts with PageUp / PageDown. */
const PAGE = 5

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
    // To the view's bottom, not the visible area's: the composer, and a question or permission form above it, resize the
    // visible area, and the rail must not change height (and re-lay its ticks) when they come and go. It lives in the
    // gutter, beside the composer, so reaching the bottom overlaps nothing.
    height: Math.max(0, box.bottom - area.top - header),
    left: Math.min(EDGE_INSET, Math.max(0, Math.round((gutter - RAIL_WIDTH) / 2))),
    show: gutter >= MIN_GUTTER,
  }
}

type HostUi = Pick<Ui, "IconButton" | "Tooltip">

function Rail(props: { input: SlotMap["session.header"]; ui: HostUi }) {
  const [scroller, setScroller] = createSignal<HTMLElement>()
  const [view, setView] = createSignal<HTMLElement>()
  const [geometry, setGeometry] = createSignal<Geometry>()
  const [current, setCurrent] = createSignal(-1)
  const [range, setRange] = createSignal<readonly [number, number]>()
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
  const indexOf = createMemo(() => new Map(ids().map((id, index) => [id, index] as const)))
  const count = () => list().length

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
    const rows = readRows(root)
    const edge = root.getBoundingClientRect()
    const fold = edge.top + inset(root)
    const index = currentPrompt(ids(), rows, fold)
    const shown = visibleRange(indexOf(), rows, { top: fold, bottom: edge.bottom })
    const box = measure(root, parent)
    setCurrent(index)
    setRange((previous) => (previous && shown && previous[0] === shown[0] && previous[1] === shown[1] ? previous : shown))
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
  // keyboard focus. Once open it stays mounted and glides between prompts instead of popping again.
  const [hover, setHover] = createSignal<number>()
  // The index under the pointer or keyboard now: it centres the fisheye. The card keeps `hover` while it closes.
  const [pointed, setPointed] = createSignal<number>()
  const [phase, setPhase] = createSignal<"closed" | "open" | "closing">("closed")
  const [entered, setEntered] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let closedAt = Number.NEGATIVE_INFINITY

  const arm = (index: number, now = false) => {
    setHover(index)
    setPointed(index)

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
    setPointed(undefined)

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

  const cardIndex = createMemo(() => {
    const index = hover()

    return index === undefined || phase() === "closed" || index >= count() ? undefined : index
  })
  const cardPrompt = () => {
    const index = cardIndex()

    return index === undefined ? undefined : list()[index]
  }
  const cardMeta = () => {
    const index = cardIndex()

    return index === undefined || more() || paging() ? undefined : `${index + 1} of ${count()}`
  }
  const label = () => list()[pointed() ?? Math.max(0, current())]?.title ?? "User message"

  let container: HTMLDivElement | undefined
  let strip: HTMLButtonElement | undefined
  let cardElement: HTMLDivElement | undefined
  const [cardTop, setCardTop] = createSignal(0)
  const [cardOrigin, setCardOrigin] = createSignal(0)
  const [armed, setArmed] = createSignal(false)
  const [stripHost, setStripHost] = createSignal<HTMLElement>()

  // Ticks are one imperative strip of nodes; every update below repaints a band of them, never all.
  const ticks = createMemo(() => {
    const host = stripHost()

    return host ? createStrip(host) : undefined
  })

  createEffect(() => {
    const host = stripHost()
    const set = ticks()

    if (!host || !set || typeof ResizeObserver !== "function") return
    const observer = new ResizeObserver(() => set.height(host.getBoundingClientRect().height))

    observer.observe(host)
    set.height(host.getBoundingClientRect().height)
    onCleanup(() => observer.disconnect())
  })
  createEffect(() => ticks()?.count(count()))
  createEffect(() => ticks()?.view(range()))
  createEffect(() => ticks()?.current(current()))
  createEffect(() => ticks()?.active(reducedMotion() ? undefined : pointed()))

  // Placed once the card has its size, before paint: Solid runs this after the DOM updates of the same tick.
  createEffect(() => {
    const index = cardIndex()
    const prompt = cardPrompt()

    if (index === undefined || !prompt || !container || !strip || !cardElement) return
    const box = container.getBoundingClientRect()
    const own = strip.getBoundingClientRect()
    const centre = own.top + (own.height * topPercent(index, count())) / 100 - box.top
    const height = cardElement.offsetHeight
    const top = Math.round(Math.max(0, Math.min(centre - height / 2, box.height - height)))
    setCardTop(top)
    setCardOrigin(Math.round(centre - top))
  })

  const select = (index: number | undefined) => {
    if (index !== undefined && index >= 0 && index < count()) run(index)
  }

  const fromPointer = (event: PointerEvent | MouseEvent) => {
    if (!strip) return null
    const box = strip.getBoundingClientRect()

    return indexFromPointer({ count: count(), top: box.top, height: box.height, y: event.clientY })
  }

  // A press that starts on the strip scrubs; a drag that arrives from elsewhere (selecting text, a scrollbar) passes
  // through, so the strip never swallows it. Released outside the window skips pointerup, so a button-free move counts.
  let pressedOnStrip = false
  const [passThrough, setPassThrough] = createSignal(false)

  const afterRelease = (done: () => void) => {
    const check = (event: PointerEvent) => {
      if (event.buttons !== 0) return
      stop()
      done()
    }
    const stop = () => {
      window.removeEventListener("pointerup", check)
      window.removeEventListener("pointermove", check)
    }
    window.addEventListener("pointerup", check)
    window.addEventListener("pointermove", check)
  }

  // The wheel on the rail scrolls the timeline, as it would beside the rail.
  const wheel = (event: WheelEvent) => {
    const root = scroller()

    if (!root) return
    event.preventDefault()
    lastInput = performance.now()
    unpin(root)
    root.scrollBy({ top: event.deltaY, left: event.deltaX })
  }

  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close()

      return
    }
    const last = count() - 1
    const at = pointed() ?? Math.max(0, current())
    const next =
      event.key === "ArrowDown"
        ? Math.min(last, at + 1)
        : event.key === "ArrowUp"
          ? Math.max(0, at - 1)
          : event.key === "PageDown"
            ? Math.min(last, at + PAGE)
            : event.key === "PageUp"
              ? Math.max(0, at - PAGE)
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? last
                  : -1

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select(pointed())

      return
    }
    if (next === -1) return
    event.preventDefault()
    arm(next, true)
  }

  const style = () => {
    const box = geometry()

    return { top: `${box?.top ?? 0}px`, height: `${box?.height ?? 0}px`, left: `${box?.left ?? 0}px` }
  }

  const step = (delta: number) => {
    const index = current() + delta

    if (current() >= 0) select(index)
  }

  const turn = (direction: "previous" | "next") => {
    const previous = direction === "previous"
    const label = previous ? "Previous turn" : "Next turn"

    return (
      <props.ui.Tooltip value={label} placement={previous ? "top" : "bottom"}>
        <span data-timeline-rail-turn={direction}>
          <props.ui.IconButton
            icon="chevron-down"
            label={label}
            size="small"
            variant="ghost-muted"
            disabled={previous ? current() <= 0 : current() < 0 || current() >= count() - 1}
            onClick={() => step(previous ? -1 : 1)}
          />
        </span>
      </props.ui.Tooltip>
    )
  }

  return (
    <span ref={(el) => (element = el)} style={{ display: "contents" }}>
      <Show when={props.input.active && desktop() && geometry()?.show && view()}>
        {(mount) => (
          <Portal mount={mount()} ref={(el) => (el.style.display = "contents")}>
            <div
              ref={(el) => {
                container = el
                el.addEventListener("wheel", wheel, { passive: false })
                // No transitions on first paint: they switch on two frames after the rail exists.
                requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)))
              }}
              data-timeline-rail
              data-empty={count() < MIN_ITEMS ? "" : undefined}
              data-armed={armed() ? "" : undefined}
              style={style()}
              onPointerLeave={() => close()}
            >
              <div data-timeline-rail-body style={{ "--timeline-rail-height": railHeightStyle(count()) }}>
                <span data-timeline-rail-history data-active={paging() ? "" : undefined} aria-hidden="true" />
                {turn("previous")}
                <button
                  ref={strip}
                  type="button"
                  data-timeline-rail-strip
                  data-pass={passThrough() ? "" : undefined}
                  aria-label={`Jump to message: ${label()}`}
                  aria-busy={loading() || paging() ? "true" : undefined}
                  onPointerDown={() => {
                    if (pressedOnStrip) return
                    pressedOnStrip = true
                    afterRelease(() => (pressedOnStrip = false))
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "touch") return
                    const index = fromPointer(event)
                    if (index !== null) arm(index)
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType === "touch") return
                    if (event.buttons !== 0 && !pressedOnStrip) {
                      if (!passThrough()) {
                        setPassThrough(true)
                        afterRelease(() => setPassThrough(false))
                      }

                      return
                    }
                    const index = fromPointer(event)
                    if (index !== null && index !== pointed()) arm(index)
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) return
                    // The prompt the card shows: a click event's clientY is a whole pixel, which at thousands of prompts
                    // is several prompts away from the fractional pointermove position the card was opened at.
                    select(pointed() ?? fromPointer(event) ?? undefined)
                    event.currentTarget.blur()
                  }}
                  onFocus={(event) => {
                    if (pointed() === undefined) arm(Math.max(0, current()), event.currentTarget.matches(":focus-visible"))
                  }}
                  onBlur={() => close()}
                  onKeyDown={keys}
                >
                  <span ref={setStripHost} data-timeline-rail-ticks aria-hidden="true" />
                </button>
                {turn("next")}
              </div>
              <Show when={cardIndex() !== undefined}>
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
// radius). Motion follows reference/animation.md: ease-out for entrances, the on-screen curve for movement, only
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
[data-timeline-rail-body] {
  position: relative;
  width: 100%;
  height: var(--timeline-rail-height);
  flex: none;
  pointer-events: none;
}
[data-timeline-rail-strip] {
  appearance: none;
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  outline: none;
  pointer-events: auto;
  user-select: none;
}
[data-timeline-rail-strip][data-pass] { pointer-events: none; }
[data-timeline-rail-strip]:focus-visible { outline: 2px solid var(--v2-border-border-focus); outline-offset: 2px; border-radius: 2px; }
[data-timeline-rail-ticks] { position: absolute; inset: 0; display: block; pointer-events: none; }
[data-timeline-rail-history] {
  position: absolute;
  top: -9px;
  left: 0;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--v2-text-text-faint);
  opacity: 0;
}
[data-timeline-rail][data-armed] [data-timeline-rail-history] { transition: opacity 200ms var(--timeline-rail-ease); }
[data-timeline-rail-history][data-active] { opacity: 1; animation: timelineRailHistory 1.4s ease-in-out infinite; }
/* Faint ticks are one gradient (a 2px tick every height / (count - 1), 8px wide); only prompts with something to show
   get a node, drawn at a third of its 24px width at rest. The fisheye is t3-code's: scale-x by index distance from the
   active prompt. Only transform and opacity ever change. */
[data-timeline-rail-base] {
  position: absolute;
  left: 0;
  top: -1px;
  width: 8px;
  height: calc(var(--timeline-rail-height) + 2px);
  background: repeating-linear-gradient(
    to bottom,
    var(--v2-text-text-faint) 0 2px,
    transparent 2px calc(var(--timeline-rail-height) * var(--stride, 1) / var(--max, 1))
  );
  opacity: 0.45;
  pointer-events: none;
}
[data-timeline-rail][data-armed] [data-timeline-rail-base] { transition: opacity 150ms var(--timeline-rail-ease); }
[data-timeline-rail-tick] {
  position: absolute;
  left: 0;
  top: calc(var(--i) / var(--max) * 100%);
  width: 24px;
  height: 2px;
  margin-top: -1px;
  transform-origin: 0 50%;
  transform: scale(0.3333, 1);
  pointer-events: none;
}
[data-timeline-rail-tick][data-d="0"] { transform: scale(1, 1.8); }
[data-timeline-rail-tick][data-d="1"] { transform: scale(0.667, 1.4); }
[data-timeline-rail-tick][data-d="2"] { transform: scale(0.417, 1.15); }
[data-timeline-rail-tick]::before,
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 1px;
  opacity: 0;
}
[data-timeline-rail-tick]::before { background: var(--v2-text-text-faint); }
[data-timeline-rail-tick]::after { background: var(--v2-text-text-base); }
[data-timeline-rail-tick][data-d]::before { opacity: 0.8; }
[data-timeline-rail-tick][data-d="0"]::after { opacity: 0.6; }
[data-timeline-rail-tick][data-view]::after,
[data-timeline-rail-tick][data-current]::after { opacity: 1; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: transform 150ms var(--timeline-rail-ease); }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 150ms var(--timeline-rail-ease); }
@media (hover: hover) and (pointer: fine) {
  [data-timeline-rail-strip]:hover [data-timeline-rail-base] { opacity: 0.8; }
}
[data-timeline-rail-turn] {
  position: absolute;
  left: -2px;
  z-index: 1;
  display: inline-flex;
  opacity: 0;
  pointer-events: auto;
}
[data-timeline-rail-turn="previous"] { bottom: calc(100% + 2px); }
[data-timeline-rail-turn="previous"] svg { transform: rotate(180deg); }
[data-timeline-rail-turn="next"] { top: calc(100% + 2px); }
[data-timeline-rail][data-armed] [data-timeline-rail-turn] { transition: opacity 150ms var(--timeline-rail-ease); }
[data-timeline-rail-body]:hover [data-timeline-rail-turn],
[data-timeline-rail-turn]:hover,
[data-timeline-rail-turn]:focus-within { opacity: 1; }
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  [data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: none; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::before,
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
  [data-timeline-rail-card][data-entered] { transition: none; }
  [data-timeline-rail-card-body], [data-timeline-rail-card][data-entered] [data-timeline-rail-card-body] { transform: none; transition: opacity 90ms linear; }
}
`

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, CSS)
    ctx.add(Slot, { at: "session.header", render: (input) => <Rail input={input} ui={ctx.ui} /> })
  },
})
