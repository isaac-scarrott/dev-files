import { fisheyeBand } from "./rail"

type Range = readonly [number, number]

/** A node that has shown no state this long is removed: long enough for its scale-down and fade to finish. */
const RETIRE_AFTER = 220

/**
 * The rail's ticks. Drawing one DOM node per prompt costs paint time in proportion to the count (measured in the
 * harness: 16ms a frame at 400 ticks, 58 at 1,000, 117 at 2,000, with a fixed main-thread cost), so the faint ticks are
 * one gradient element laid out from `--max`, and only prompts with something to show get a node: the fisheye band
 * around the active index, the prompts in view, the current one. A pointer, scroll or keyboard update touches that
 * band, never the count, and no node has a listener.
 */
export function createStrip(host: HTMLElement) {
  const base = document.createElement("span")
  const pool = new Map<number, HTMLElement>()
  let count = 0
  let view: Range | undefined
  let current = -1
  let active: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const idle = new Map<number, number>()

  base.setAttribute("data-timeline-rail-base", "")
  host.appendChild(base)

  const stateOf = (index: number) => ({
    d: active === undefined ? undefined : Math.abs(index - active),
    view: view !== undefined && index >= view[0] && index <= view[1],
    current: index === current,
  })

  const node = (index: number) => {
    let found = pool.get(index)

    if (found) return found
    found = document.createElement("span")
    found.setAttribute("data-timeline-rail-tick", "")
    found.setAttribute("data-index", String(index))
    found.setAttribute("aria-hidden", "true")
    found.style.setProperty("--i", String(index))
    host.appendChild(found)
    pool.set(index, found)
    // Its first style is the resting one, so the state it is about to get animates in.
    void found.offsetWidth

    return found
  }

  const sweep = () => {
    timer = undefined
    const now = performance.now()

    for (const [index, since] of idle) {
      if (now - since < RETIRE_AFTER) continue
      idle.delete(index)
      pool.get(index)?.remove()
      pool.delete(index)
    }
    if (idle.size > 0) timer = setTimeout(sweep, RETIRE_AFTER)
  }

  /** Writes what `index` should show; a node with nothing to show is queued for removal. */
  const paint = (index: number) => {
    if (index < 0 || index >= count) return
    const state = stateOf(index)
    const shown = (state.d !== undefined && state.d <= 2) || state.view || state.current

    if (!shown && !pool.has(index)) return
    const el = shown ? node(index) : pool.get(index)!
    const set = (name: string, on: boolean, value = "") => {
      if (on) {
        if (el.getAttribute(name) !== value) el.setAttribute(name, value)
      } else if (el.hasAttribute(name)) el.removeAttribute(name)
    }

    set("data-d", state.d !== undefined && state.d <= 2, String(state.d))
    set("data-view", state.view)
    set("data-current", state.current)

    if (shown) idle.delete(index)
    else if (!idle.has(index)) {
      idle.set(index, performance.now())
      timer ??= setTimeout(sweep, RETIRE_AFTER)
    }
  }

  const each = (range: Range | undefined, run: (index: number) => void) => {
    if (!range) return
    for (let index = range[0]; index <= range[1]; index += 1) run(index)
  }

  return {
    nodes: () => [...pool.values()],
    /** The number of prompts: only the host's `--max` changes, which moves every gradient tick at once. */
    count(next: number) {
      const before = count

      count = next
      host.style.setProperty("--max", String(Math.max(1, next - 1)))
      for (const [index, el] of pool) {
        if (index < next) continue
        el.remove()
        pool.delete(index)
        idle.delete(index)
      }
      if (current >= next) current = -1
      if (view && view[0] >= next) view = undefined
      else if (view && view[1] >= next) view = [view[0], next - 1]
      if (active !== undefined && active >= next) active = undefined
      if (next > before) each(view, paint)
    },
    /** The prompts in view: only the ends that moved are touched. */
    view(next: Range | undefined) {
      const before = view
      const clipped: Range | undefined = next && next[0] < count ? [next[0], Math.min(next[1], count - 1)] : undefined

      view = clipped
      each(before, (index) => {
        if (!clipped || index < clipped[0] || index > clipped[1]) paint(index)
      })
      each(clipped, (index) => {
        if (!before || index < before[0] || index > before[1]) paint(index)
      })
    },
    current(next: number) {
      const to = next >= 0 && next < count ? next : -1

      if (to === current) return
      const before = current

      current = to
      paint(before)
      paint(to)
    },
    /** The fisheye centre, or undefined for none. */
    active(next: number | undefined) {
      const before = fisheyeBand(active, count)

      active = next
      each(before, paint)
      each(fisheyeBand(active, count), paint)
    },
  }
}

export type Strip = ReturnType<typeof createStrip>
