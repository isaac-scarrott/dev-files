/** The row above the composer that the app's own pills float in: out of flow, so nothing in it moves the composer. */
export const LANE = '[data-component="session-composer-lane"]'
const PANEL = '[data-slot="session-chat-panel"]'

/**
 * The lane of the composer the user is looking at. The app keeps one lane in the document at a time; only when it keeps
 * several (a hidden, kept timeline has no layout boxes) does the visible one need a layout read.
 */
export function visibleLane(root: ParentNode = document) {
  const lanes = Array.from(root.querySelectorAll<HTMLElement>(LANE))

  return lanes.length > 1 ? lanes.find((lane) => lane.getClientRects().length > 0) : lanes[0]
}

/** Frames after a placement during which the app may still swap the panel under it (a session switch). */
const SETTLE_FRAMES = 45
/** Frames to wait for a lane that is not there yet. */
const WAIT_FRAMES = 120

/**
 * Keeps `host` inside the visible lane. A session switch replaces the whole chat panel a few frames after the route
 * changes, and the lane mounts after the session does, so this looks each frame until the lane exists, keeps checking
 * through the settle window, and afterwards watches the two parents whose children change when the app rebuilds the
 * lane or the panel (child lists only, no subtree). `onPlaced` runs once, at the first placement. Returns the cleanup.
 */
export function attach(host: HTMLElement, onPlaced?: () => void, find: () => HTMLElement | undefined = visibleLane) {
  let frame = 0
  let waited = 0
  let settled = 0
  let announced = false
  const watched = new Set<Element>()
  const observer = new MutationObserver(() => {
    if (!host.isConnected && !frame) seek()
  })

  const watch = (lane: HTMLElement) => {
    const parents = [lane.parentElement, lane.closest(PANEL)?.parentElement]

    for (const parent of parents) {
      if (!parent || watched.has(parent)) continue
      watched.add(parent)
      observer.observe(parent, { childList: true })
    }
  }

  const place = () => {
    const lane = find()

    if (!lane) return false

    if (host.parentElement !== lane) lane.append(host)
    watch(lane)

    if (!announced) {
      announced = true
      onPlaced?.()
    }

    return true
  }

  const seek = () => {
    waited = 0
    settled = 0
    frame = requestAnimationFrame(look)
  }

  // The document is searched only while the host has no lane; once placed, the window just waits for the swap, which
  // takes the host out of the document with the old lane.
  const look = () => {
    frame = 0

    if (host.isConnected ? ++settled >= SETTLE_FRAMES : !place() && ++waited > WAIT_FRAMES) return
    frame = requestAnimationFrame(look)
  }

  seek()

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    host.remove()
  }
}
