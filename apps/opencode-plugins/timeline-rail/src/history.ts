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
  /** Receives the px the host left the reading position off by after each frame of a page; tests and the harness read it. */
  drift?(px: number): void
}

/** The user must have held still this long before the next page is requested. */
export const QUIET_MS = 160
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
    while (host.more() && !signal.aborted) {
      await host.frame()
      while (host.idle() < QUIET_MS && !signal.aborted) await host.frame()
      if (signal.aborted) return
      let anchor: Anchor | undefined

      await host.loadMore({ signal, beforePublish: () => (anchor = anchorAt(host)) })
      if (anchor) await hold(host, anchor, signal)
    }
  } catch {
    // The host reports its own load errors; the rail keeps the ticks it has.
  } finally {
    host.loading(false)
  }
}
