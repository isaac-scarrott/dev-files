/** What the loader needs from the timeline it fills in. */
export type HistoryHost = {
  readonly scroller: HTMLElement
  /** Older pages exist on the server. */
  more(): boolean
  /** One page, prepended in one store batch; `beforePublish` runs inside that batch, before the list changes. */
  loadMore(options: { signal: AbortSignal; beforePublish: () => void }): Promise<void>
  /** Resolves on the next animation frame. */
  frame(): Promise<void>
  /** Milliseconds since the user last scrolled or touched the timeline. */
  idle(): number
  /** The sticky header's height: rows above the fold are not the reading position. */
  inset(): number
  loading(value: boolean): void
  /** Resolves after `ms`, then a moment the page is idle; absent means no pause. The loader waits before the first page and between pages. */
  pause?(ms: number, signal: AbortSignal): Promise<void>
  /** Receives the px the host left the reading position off by after each frame of a page; tests and the harness read it. */
  drift?(px: number): void
}

/** The user must have held still this long before the next page is requested. */
export const QUIET_MS = 160
/**
 * Before the first page, and between pages. Opening a thread already costs the host its own render; each page is a store
 * write and a render of heavy rows (tool output, diffs), and paging flat out right after a switch halved the frame
 * rate for a second or more on a real thread. Spread out, the same pages land in idle time.
 */
export const START_DELAY_MS = 1200
export const PAGE_GAP_MS = 400
/** Frames the reading position is watched after a page lands: the virtualizer mounts the new count a frame late. */
const SETTLE_FRAMES = 4

type Anchor = { readonly element: HTMLElement; readonly top: number }

/** The row at the fold and where it sits, so a page that lands above it cannot move what the user reads. */
function anchorAt(host: HistoryHost): Anchor | undefined {
  const fold = host.scroller.getBoundingClientRect().top + host.inset()

  for (const element of host.scroller.querySelectorAll<HTMLElement>("[data-message-id]")) {
    const box = element.getBoundingClientRect()

    if (box.bottom > fold) return { element, top: box.top }
  }

  return undefined
}

/** Puts the anchor back where it was for the few frames the virtualizer needs to place the new rows. */
async function hold(host: HistoryHost, anchor: Anchor, signal: AbortSignal) {
  const { scroller } = host

  for (let frame = 0; frame < SETTLE_FRAMES && !signal.aborted; frame += 1) {
    await host.frame()

    // Gone from the DOM, or the user took over: their scroll wins.
    if (!anchor.element.isConnected || host.idle() < 32) return
    const delta = anchor.element.getBoundingClientRect().top - anchor.top

    host.drift?.(delta)
    if (Math.abs(delta) > 1) scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: "auto" })
  }
}

/**
 * Pages the whole conversation in behind the user, one page at a time: each request waits for the user to stop
 * scrolling and for a frame, and the reading position is held across each prepend. Stops when the history is
 * complete, the signal aborts, or a page fails (the next trigger tries again).
 */
export async function loadHistory(host: HistoryHost, signal: AbortSignal): Promise<void> {
  if (!host.more() || signal.aborted) return
  host.loading(true)

  try {
    await host.pause?.(START_DELAY_MS, signal)

    while (host.more() && !signal.aborted) {
      await host.frame()
      while (host.idle() < QUIET_MS && !signal.aborted) await host.frame()
      if (signal.aborted) return
      let anchor: Anchor | undefined

      await host.loadMore({ signal, beforePublish: () => (anchor = anchorAt(host)) })
      if (anchor) await hold(host, anchor, signal)
      if (host.more()) await host.pause?.(PAGE_GAP_MS, signal)
    }
  } catch {
    // The host reports its own load errors; the rail keeps the ticks it has.
  } finally {
    host.loading(false)
  }
}
