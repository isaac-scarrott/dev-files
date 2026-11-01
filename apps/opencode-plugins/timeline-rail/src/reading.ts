import { activePrompt, READING_OFFSET, type Row } from "./target"

/** Pixels of scroll slack that still count as the very bottom (fractional scroll offsets, rounding). */
const END_SLACK = 2
/** An observer root grown this far upward holds the whole timeline above its bottom edge. */
const ABOVE = 10_000_000
/** Frames to wait for the virtualizer's container to appear before giving up until the next `rescan`. */
const WAIT_FRAMES = 120

/**
 * The margins that make an observer's root everything above `line`: grown far upward, shrunk from below to end on the
 * line. A target intersects it exactly when its top is at or above the line, however far a scroll or a layout shift
 * moves it in one frame (a thin band would be skipped by a row that jumps across it).
 */
export function lineMargin(input: { readonly contentBottom: number; readonly line: number }): string {
  return `${ABOVE}px 0px ${-(input.contentBottom - input.line)}px 0px`
}

/** The root margins of the observer that tells when the scroller is at its very bottom (see `readReading`). */
export function endMargin(tail: number): string {
  return `${ABOVE}px 0px ${END_SLACK - tail}px 0px`
}

export type Reading = {
  /** The active prompt index in `ids` from what the observers last saw (see `activePrompt`). */
  active(ids: readonly string[]): number
  /** Looks for the virtualizer's container again, after the timeline was rebuilt or filled in late. */
  rescan(): void
  stop(): void
}

type Seen = { owner: string | undefined; prompt: boolean; reached: boolean | undefined }

/**
 * Which turn the timeline is being read in, without reading layout while it scrolls. The virtualizer mounts each row in
 * a keyed wrapper (`[data-timeline-key]`) under one container. An IntersectionObserver whose root is everything above
 * the reading line (`READING_OFFSET` under the sticky header) is told by the browser, after layout, when a wrapper's top
 * crosses the line, so a scroll frame costs the plugin nothing unless a row crosses. A wrapper has `reached` the line
 * when it intersects that root, i.e. its top is at or above the line. A MutationObserver on
 * the container's children follows mounts and unmounts; a ResizeObserver keeps the line (header or scroller height) and
 * the scroll range (content height) current, where layout is clean. The very bottom is a second IntersectionObserver
 * on the container, whose root reaches far above the viewport and ends `tail` (the spacer under the container) above
 * the viewport's bottom edge, 2px short: the container lies wholly inside it exactly when the scroller is within 2px of
 * its end. Nothing listens to `scroll`, and nothing reads layout while the timeline moves.
 *
 * `changed` runs when the answer may have changed; it asks `active` for it.
 */
export function readReading(root: HTMLElement, changed: () => void): Reading {
  const seen = new Map<Element, Seen>()
  let container: Element | undefined
  let io: IntersectionObserver | undefined
  let endIo: IntersectionObserver | undefined
  let margin = ""
  let tail: number | undefined
  let max = 0
  let atEnd = false
  let header: HTMLElement | null = null
  let waiting: number | undefined
  let stopped = false

  const ownerOf = (wrapper: Element) => {
    const row = wrapper.matches("[data-message-id]") ? wrapper : wrapper.querySelector("[data-message-id]")

    return row instanceof HTMLElement && row.dataset.messageId
      ? { owner: row.dataset.messageId, prompt: row.dataset.timelineRow === "UserMessage" }
      : undefined
  }

  const deliver = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      if (!entry.target.isConnected) continue
      const before = seen.get(entry.target)
      const found = ownerOf(entry.target)

      seen.set(entry.target, {
        owner: found?.owner ?? before?.owner,
        prompt: found?.prompt ?? before?.prompt ?? false,
        reached: entry.isIntersecting,
      })
    }
    changed()
  }

  // Layout is clean inside a ResizeObserver callback, so these reads are free.
  const fit = () => {
    const box = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    const contentBottom = box.top + root.clientTop + root.clientHeight - (parseFloat(style.paddingBottom) || 0)
    const line = box.top + (header?.offsetHeight ?? 0) + READING_OFFSET

    return lineMargin({ contentBottom, line })
  }

  const observe = () => {
    io?.disconnect()
    io = undefined

    if (!container || typeof IntersectionObserver !== "function") return
    io = new IntersectionObserver(deliver, { root, rootMargin: margin, threshold: 0 })
    for (const child of container.children) io.observe(child)
  }

  const deliverEnd = (entries: IntersectionObserverEntry[]) => {
    const entry = entries.at(-1)

    if (!entry?.rootBounds) return
    const end = entry.boundingClientRect.bottom <= entry.rootBounds.bottom

    if (end === atEnd) return
    atEnd = end
    changed()
  }

  const observeEnd = () => {
    endIo?.disconnect()
    endIo = undefined

    if (!container || tail === undefined || typeof IntersectionObserver !== "function") return
    endIo = new IntersectionObserver(deliverEnd, { root, rootMargin: endMargin(tail), threshold: 1 })
    endIo.observe(container)
  }

  // The scroll range, and the spacer between the container's bottom and the scroller's content end.
  const range = () => {
    max = root.scrollHeight - root.clientHeight
    if (!container) return
    const next = root.scrollHeight - (container.getBoundingClientRect().bottom - root.getBoundingClientRect().top - root.clientTop + root.scrollTop)

    if (tail !== undefined && Math.abs(next - tail) < 0.5) return
    tail = next
    observeEnd()
  }

  const resize = new ResizeObserver((entries) => {
    if (container && !container.isConnected) {
      scan()

      return
    }
    const before = margin
    const maxBefore = max

    range()
    if (!margin || entries.some((entry) => entry.target === root || entry.target === header)) margin = fit()
    if (margin !== before) observe()
    if (margin !== before || max !== maxBefore) changed()
  })

  const children = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node instanceof Element) io?.unobserve(node)
        seen.delete(node as Element)
      }
      for (const node of record.addedNodes) if (node instanceof Element) io?.observe(node)
    }
    changed()
  })

  const scan = (left = WAIT_FRAMES) => {
    waiting = undefined

    if (stopped) return
    const found = root.querySelector("[data-timeline-key]")?.parentElement ?? undefined

    if (!found) {
      if (left > 0) waiting = requestAnimationFrame(() => scan(left - 1))

      return
    }
    if (found === container && found.isConnected) return
    children.disconnect()
    resize.disconnect()
    seen.clear()
    tail = undefined
    atEnd = false
    container = found
    header = root.querySelector<HTMLElement>("[data-session-title]")
    children.observe(container, { childList: true })
    margin = ""
    // The first notification measures the line and the range after layout, which a read here would force.
    resize.observe(root)
    resize.observe(container)
    if (header) resize.observe(header)
    changed()
  }

  scan()

  return {
    active(ids) {
      const rows: Row[] = []

      for (const child of container?.children ?? []) {
        const row = seen.get(child)

        if (!row || row.reached === undefined) continue
        // A row can mount in its wrapper after the wrapper was first seen.
        const found = row.owner ? undefined : ownerOf(child)

        if (found) {
          row.owner = found.owner
          row.prompt = found.prompt
        }
        if (row.owner) rows.push({ owner: row.owner, prompt: row.prompt, top: row.reached ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY, bottom: 0 })
      }

      return activePrompt(ids, rows, 0, { top: atEnd ? max : 0, max })
    },
    rescan: () => {
      if (waiting === undefined) scan()
    },
    stop() {
      stopped = true
      if (waiting !== undefined) cancelAnimationFrame(waiting)
      io?.disconnect()
      endIo?.disconnect()
      children.disconnect()
      resize.disconnect()
    },
  }
}
