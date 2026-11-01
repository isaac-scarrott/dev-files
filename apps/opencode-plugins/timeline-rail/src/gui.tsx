import { Plugin, Slot, Style, type SlotMap, type Ui } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, Index, on, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { inset, jumpTo, readRows, unpin, type Host } from "./jump"
import { EMPTY_TITLE, indexFromPointer, loadedIds, MIN_ITEMS, promptWindow, prompts, railHeightStyle, topPercent, visibleRange, type Message, type PromptWindow } from "./rail"
import { currentPrompt } from "./target"
import { tweenScroll } from "./tween"

/** t3-code's `left-3`: the strip sits this far from the view's left edge. */
const STRIP_LEFT = 12
/** t3-code's `TIMELINE_MINIMAP_HIT_STRIP_MAX_WIDTH`. */
const HIT_MAX = 40
/** t3-code's `TIMELINE_MINIMAP_PERSISTENT_GUTTER`: with less room the rail shows only while hovered or focused. */
const PERSISTENT_GUTTER = 48
/** t3-code's `TIMELINE_MINIMAP_NAVIGATION_REACH`: the chevrons are reachable only with a strip this wide. */
const NAVIGATION_REACH = 14
/** The host hides the session header under this width (`createMediaQuery` in `session/model.ts`). */
const DESKTOP = "(min-width: 768px)"

type Geometry = {
  readonly top: number
  readonly height: number
  /** The strip's pointer width in px: the gutter minus its offset, at most 40; 0 means the rail is not offered. */
  readonly hit: number
  readonly persistent: boolean
}

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
 * motion) or from the column width token when no row is mounted. The gutter decides the strip's width and whether the
 * rail is always shown, as t3-code's `resolveTimelineMinimapHitStripWidth` and `...HasPersistentGutter`.
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
  const gutter = Math.max(0, column - box.left)
  const header = inset(scroller)

  return {
    top: area.top - box.top + header,
    // To the view's bottom, not the visible area's: the composer, and a question or permission form above it, resize the
    // visible area, and the rail must not change height (and re-lay its ticks) when they come and go. It lives in the
    // gutter, beside the composer, so reaching the bottom overlaps nothing.
    height: Math.max(0, box.bottom - area.top - header),
    hit: Math.max(0, Math.min(HIT_MAX, Math.floor(gutter) - STRIP_LEFT)),
    persistent: gutter >= PERSISTENT_GUTTER,
  }
}

type HostUi = Pick<Ui, "IconButton" | "Tooltip">

/** The pointer is over the card: its text is selectable and it is not the strip. */
const onCard = (target: EventTarget | null) => (target as Element | null)?.closest?.("[data-timeline-rail-card]") != null

function Rail(props: { input: SlotMap["session.header"]; ui: HostUi }) {
  const [scroller, setScroller] = createSignal<HTMLElement>()
  const [view, setView] = createSignal<HTMLElement>()
  const [geometry, setGeometry] = createSignal<Geometry>()
  const [current, setCurrent] = createSignal(-1)
  const [range, setRange] = createSignal<readonly [number, number]>()
  const [desktop, setDesktop] = createSignal(true)
  const session = () => props.input.session
  const data = () => session().server.data.session
  const messages = () => data().message.list(session().id) as readonly Message[]
  const revert = () => data().get(session().id)?.revert?.messageID

  // What the host has loaded. The rail never asks for more: older history reaches it only when the host loads it, as
  // t3-code's minimap only grows when the user presses "Load earlier turns".
  const loaded = createMemo(() => loadedIds(messages(), revert()))
  // The user has scrolled, touched or typed in the timeline: a page of older history that lands now was asked for.
  let asked = false
  let window_: PromptWindow | undefined
  let windowSession: string | undefined
  // t3-code's thread window: the newest prompts at first, a page more when the host pages older history in.
  const covered = createMemo(() => {
    if (windowSession !== session().id) {
      windowSession = session().id
      window_ = undefined
      asked = false
    }
    window_ = promptWindow(window_, loaded(), asked)

    return window_
  })
  const list = createMemo(() => {
    const from = covered()?.from

    return from ? prompts(messages(), revert(), from) : []
  })
  const ids = createMemo(() => list().map((prompt) => prompt.id))
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

  createEffect(() => {
    const root = scroller()

    if (!root) return
    const mark = () => void (asked = true)
    const types = ["wheel", "touchmove", "pointerdown", "keydown"] as const

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
      // Every prompt the host holds, not only the rail's: the far-jump estimate is a share of the whole content height.
      ids: loaded,
      reducedMotion,
      frame,
      tween: (to, signal) => tweenScroll({ scroller: root, frame, now: () => performance.now() }, to, signal),
    }
  }

  let pending: number | undefined

  const refresh = () => {
    pending = undefined
    const root = scroller()
    const parent = view()

    if (!props.input.active || !root || !parent) return
    // Reads only; Solid applies the writes after.
    const rows = readRows(root)
    const edge = root.getBoundingClientRect()
    const box = { top: edge.top + inset(root), bottom: edge.bottom }
    const shown = visibleRange(indexOf(), rows, box)
    const place = measure(root, parent)
    setCurrent(currentPrompt(ids(), rows, box))
    setRange((previous) => (previous && shown && previous[0] === shown[0] && previous[1] === shown[1] ? previous : shown))
    setGeometry((previous) =>
      previous && previous.top === place.top && previous.height === place.height && previous.hit === place.hit && previous.persistent === place.persistent
        ? previous
        : place,
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

  createEffect(on([ids, () => props.input.active, desktop], schedule, { defer: true }))

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

  // The index under the pointer or keyboard: it centres the fisheye and names the card. t3-code opens the card the
  // moment an index is active and removes it the moment it is not: no delay, no motion.
  const [pointed, setPointed] = createSignal<number>()
  const [armed, setArmed] = createSignal(false)
  const [passThrough, setPassThrough] = createSignal(false)
  const activePrompt = () => {
    const index = pointed()

    return index === undefined || index >= count() ? undefined : list()[index]
  }
  const label = () => activePrompt()?.title ?? EMPTY_TITLE

  let strip: HTMLButtonElement | undefined

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

    if (!root || event.defaultPrevented || event.ctrlKey || event.deltaY === 0) return
    event.preventDefault()
    unpin(root)
    root.scrollBy({ top: event.deltaY, left: event.deltaX })
  }

  // t3-code's keys: arrows move by one from the current prompt, Home and End go to the ends, Enter or Space jump.
  const keys = (event: KeyboardEvent) => {
    const last = count() - 1

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select(pointed())

      return
    }
    const at = pointed() ?? 0
    const next =
      event.key === "ArrowDown" ? Math.min(last, at + 1) : event.key === "ArrowUp" ? Math.max(0, at - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1

    if (next === -1) return
    event.preventDefault()
    setPointed(next)
  }

  const style = () => {
    const box = geometry()

    return { top: `${box?.top ?? 0}px`, height: `${box?.height ?? 0}px` }
  }

  const step = (delta: number) => {
    if (current() >= 0) select(current() + delta)
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

  // The card hangs off the tick's percentage like t3-code's: centred on it, flush with the strip's top for the first
  // prompt and its bottom for the last. No clamping to the view.
  const cardShift = (index: number) => (index === 0 ? "0%" : index === count() - 1 ? "-100%" : "-50%")

  return (
    <span ref={(el) => (element = el)} style={{ display: "contents" }}>
      <Show when={props.input.active && desktop() && count() >= MIN_ITEMS && (geometry()?.hit ?? 0) > 0 && view()}>
        {(mount) => (
          <Portal mount={mount()} ref={(el) => (el.style.display = "contents")}>
            <div
              ref={(el) => {
                el.addEventListener("wheel", wheel, { passive: false })
                // No transitions on first paint: they switch on two frames after the rail exists.
                requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)))
              }}
              data-timeline-rail
              data-persistent={geometry()?.persistent ? "" : undefined}
              data-armed={armed() ? "" : undefined}
              style={style()}
            >
              <div
                data-timeline-rail-body
                data-navigation={(geometry()?.hit ?? 0) >= NAVIGATION_REACH ? "" : undefined}
                data-pass={passThrough() ? "" : undefined}
                style={{
                  "--timeline-rail-height": railHeightStyle(count()),
                  width: activePrompt() ? "22rem" : `${geometry()?.hit ?? 0}px`,
                }}
                onPointerDown={() => {
                  if (pressedOnStrip) return
                  pressedOnStrip = true
                  afterRelease(() => (pressedOnStrip = false))
                }}
                onPointerMove={(event) => {
                  if (event.buttons === 0 || pressedOnStrip || passThrough()) return
                  setPassThrough(true)
                  afterRelease(() => setPassThrough(false))
                }}
              >
                {turn("previous")}
                <button
                  ref={strip}
                  type="button"
                  data-timeline-rail-strip
                  aria-label={`Jump to message: ${label()}`}
                  onMouseDown={(event) => {
                    if (!onCard(event.target)) event.preventDefault()
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType === "touch" || (event.buttons !== 0 && !pressedOnStrip)) return
                    const index = fromPointer(event)
                    if (index !== null && index !== pointed()) setPointed(index)
                  }}
                  onPointerLeave={() => setPointed(undefined)}
                  onClick={(event) => {
                    if (onCard(event.target) || event.detail === 0) return
                    // The prompt the card shows: a click event's clientY is a whole pixel, which at thousands of prompts
                    // is several prompts away from the fractional pointermove position the card was opened at.
                    select(pointed() ?? fromPointer(event) ?? undefined)
                    event.currentTarget.blur()
                  }}
                  onFocus={() => {
                    if (pointed() === undefined) setPointed(Math.max(0, current()))
                  }}
                  onBlur={() => setPointed(undefined)}
                  onKeyDown={keys}
                >
                  <Index each={list()}>
                    {(_, index) => (
                      <span
                        data-timeline-rail-tick
                        data-index={index}
                        data-d={pointed() !== undefined && Math.abs(index - pointed()!) <= 2 ? Math.abs(index - pointed()!) : undefined}
                        data-view={range() && index >= range()![0] && index <= range()![1] ? "" : undefined}
                        aria-hidden="true"
                        style={{ top: `${topPercent(index, count())}%` }}
                      />
                    )}
                  </Index>
                  <Show when={activePrompt()}>
                    {(item) => (
                      <span
                        data-timeline-rail-card
                        onPointerMove={(event) => event.stopPropagation()}
                        style={{ top: `${topPercent(pointed()!, count())}%`, transform: `translateY(${cardShift(pointed()!)})` }}
                      >
                        <span data-timeline-rail-card-body role="tooltip">
                          <span data-timeline-rail-card-title dir="auto">
                            {item().title}
                          </span>
                          <Show when={item().snippet}>
                            <span data-timeline-rail-card-snippet dir="auto">
                              {item().snippet}
                            </span>
                          </Show>
                        </span>
                      </span>
                    )}
                  </Show>
                </button>
                {turn("next")}
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </span>
  )
}

// The structure is t3-code's TimelineMinimap. The card uses the host's menu surface for colour and shadow
// (`menu-v2-content`: layer-01, floating elevation) at t3-code's geometry. The only motion is t3-code's: `transform`
// on the ticks (150ms, Tailwind's default curve) and `opacity` on the in-view overlay and the hover reveal, none of it
// until `data-armed` (two frames after the rail exists, so nothing animates on first paint).
const CSS = `
[data-timeline-rail] {
  position: absolute;
  left: 0;
  z-index: 55;
  display: none;
  flex-direction: column;
  justify-content: center;
  width: 72px;
  pointer-events: none;
  --timeline-rail-curve: cubic-bezier(0.4, 0, 0.2, 1);
}
@media (pointer: fine) {
  [data-timeline-rail] { display: flex; }
}
[data-timeline-rail]:not([data-persistent]) { opacity: 0; }
[data-timeline-rail]:not([data-persistent]):hover,
[data-timeline-rail]:not([data-persistent]):focus-within { opacity: 1; }
[data-timeline-rail][data-armed]:not([data-persistent]) { transition: opacity 150ms var(--timeline-rail-curve); }
[data-timeline-rail-body] {
  position: relative;
  margin-left: ${STRIP_LEFT}px;
  height: var(--timeline-rail-height);
  flex: none;
  pointer-events: none;
}
[data-timeline-rail-body]:not([data-pass]) { pointer-events: auto; }
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
  font: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
  user-select: none;
}
[data-timeline-rail-strip]:focus-visible { box-shadow: inset 0 0 0 2px var(--v2-border-border-focus); }
/* One span per prompt: 24px wide, drawn at a third of that at rest, scaled by index distance from the pointer.
   The colour is a node background, so only transform and the overlay's opacity ever change. */
[data-timeline-rail-tick] {
  position: absolute;
  left: 0;
  width: 24px;
  height: 2px;
  margin-top: -1px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--v2-text-text-faint) 45%, transparent);
  transform-origin: 0 50%;
  transform: scaleX(0.3333);
  pointer-events: none;
}
[data-timeline-rail-tick][data-d="0"] { transform: scaleX(1); background: color-mix(in srgb, var(--v2-text-text-base) 60%, transparent); }
[data-timeline-rail-tick][data-d="1"] { transform: scaleX(0.667); }
[data-timeline-rail-tick][data-d="2"] { transform: scaleX(0.417); }
[data-timeline-rail-tick]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 1px;
  background: var(--v2-text-text-base);
  opacity: 0;
}
[data-timeline-rail-tick][data-view]::after { opacity: 1; }
[data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: transform 150ms var(--timeline-rail-curve); }
[data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 150ms var(--timeline-rail-curve); }
[data-timeline-rail-turn] {
  position: absolute;
  left: 4px;
  z-index: 1;
  display: none;
  transform: translateX(-50%);
  opacity: 0;
}
[data-timeline-rail-body][data-navigation] [data-timeline-rail-turn] { display: inline-flex; pointer-events: auto; }
[data-timeline-rail-turn="previous"] { bottom: calc(100% + 2px); }
[data-timeline-rail-turn="previous"] svg { transform: rotate(180deg); }
[data-timeline-rail-turn="next"] { top: calc(100% + 2px); }
[data-timeline-rail][data-armed] [data-timeline-rail-turn] { transition: opacity 150ms var(--timeline-rail-curve); }
[data-timeline-rail-turn]:hover,
[data-timeline-rail-turn]:focus-within { opacity: 1; }
[data-timeline-rail-card] {
  position: absolute;
  left: 32px;
  width: 320px;
  display: block;
  cursor: text;
  user-select: text;
  pointer-events: auto;
}
[data-timeline-rail-card-body] {
  display: block;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 12px;
  background: var(--v2-background-bg-layer-01);
  box-shadow: var(--v2-elevation-floating);
  color: var(--v2-text-text-base);
  text-align: left;
}
[data-timeline-rail-card-title] {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
[data-timeline-rail-card-snippet] {
  display: -webkit-box;
  margin-top: 4px;
  max-height: 60px;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 20px;
  color: var(--v2-text-text-muted);
}
@media (prefers-reduced-motion: reduce) {
  [data-timeline-rail][data-armed] [data-timeline-rail-tick] { transition: none; }
  [data-timeline-rail][data-armed] [data-timeline-rail-tick]::after { transition: opacity 120ms linear; }
}
`

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, CSS)
    ctx.add(Slot, { at: "session.header", render: (input) => <Rail input={input} ui={ctx.ui} /> })
  },
})
