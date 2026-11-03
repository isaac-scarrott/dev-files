import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { ComposerPill, IconName } from "@opencode/plugin/gui"
import { CHIP_MS, domMotion, type ChipMotion, type ChipRun } from "./chip-motion"

// The host's `ComposerPill` is the chip: it renders the capsule, its popover and its focus, and honours where the user put the
// Background activity row. What it cannot do is leave: it removes a pill the instant `show` returns nothing, with no motion
// and with the neighbours jumping. This controller therefore owns when `show` stops, which is after the chip has collapsed.

export interface LaneChipOptions {
  /** The pill's id within the plugin. */
  id: string
  icon: IconName
  /** The icon while the session's items are all at rest (`settle`'s `resting`); `icon` when absent. */
  restIcon?: IconName
  /** The capsule's text and accessible name for a count, e.g. "2 monitors". */
  label(count: number): string
  menu: NonNullable<ComposerPill["menu"]>
  order?: number
  /** Where the capsules are found and moved; the browser's by default. */
  motion?: ChipMotion
  find?: (title: string) => HTMLElement[]
}

export interface LaneChipSession {
  readonly key: string
  /** `MountedSession.visit`: the same object for as long as the session stays routed. */
  readonly visit?: object
}

export interface LaneChip {
  readonly pill: ComposerPill
  /**
   * Reports how many items the session has. A change the user is watching (same routing visit, the count already known)
   * moves the chip; anything else (a session just opened, a first answer) sets it at rest.
   * `resting`: none of the items is at work; the chip then wears `restIcon`.
   */
  settle(session: LaneChipSession, count: number, resting?: boolean): void
}

const pillsIn = (doc: Document) => (title: string) =>
  [...doc.querySelectorAll<HTMLElement>('[data-slot="session-plugin-pill"]')].filter(
    (el) => el.getAttribute("aria-label") === title && el.getClientRects().length > 0,
  )

interface Known {
  count: number
  visit: object | undefined
}

interface Moving {
  run: ChipRun
  leaving: boolean
  /** A count that arrived while the chip was moving; shown, with its own width ease, once the move has ended. */
  queued?: number
}

/** Call inside `setup`: the controller ends with the plugin. */
export function createLaneChip(options: LaneChipOptions): LaneChip {
  const motion = options.motion ?? domMotion
  const find = options.find ?? pillsIn(document)
  // What each session's chip shows. While a chip leaves it keeps its old count, so it keeps its text until it is gone.
  const [shown, setShown] = createStore<Record<string, number>>({})
  const [resting, setResting] = createStore<Record<string, boolean>>({})
  const known = new Map<string, Known>()
  const moving = new Map<string, Moving>()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  onCleanup(() => {
    for (const timer of timers) clearTimeout(timer)
    for (const { run } of moving.values()) run.cancel()
    moving.clear()
  })

  const view = (count: number, rest: boolean) => ({ label: options.label(count), title: options.label(count), icon: rest ? (options.restIcon ?? options.icon) : options.icon })

  // The capsule is in the document only after the host has rendered the new count, which it does synchronously when the
  // store changes; a microtask is before the next paint, so the chip never shows at full size for a frame first.
  const afterRender = (work: () => void) => queueMicrotask(work)

  const watch = (key: string, run: ChipRun, leaving: boolean) => {
    const entry: Moving = { run, leaving }
    moving.set(key, entry)
    // A hidden window does not advance animations; the chip must still go once the count is zero.
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (moving.get(key) === entry && entry.leaving) {
        run.cancel()
        moving.delete(key)
        setShown(key, 0)
      }
    }, CHIP_MS + 1300)
    timers.add(timer)
    run.onFinish(() => {
      clearTimeout(timer)
      timers.delete(timer)
      if (moving.get(key) !== entry) return
      moving.delete(key)
      if (entry.leaving) return setShown(key, 0)
      if (entry.queued !== undefined && entry.queued !== shown[key]) resize(key, shown[key] ?? 0, entry.queued)
    })
    return entry
  }

  // 1 monitor to 2 monitors: the capsule's text is wider by a letter; ease the width instead of moving everything at once.
  const resize = (key: string, before: number, count: number) => {
    const from = find(options.label(before))[0]?.getBoundingClientRect().width
    setShown(key, count)
    if (from === undefined) return
    afterRender(() => {
      const chips = find(options.label(count))
      const run = chips.length ? motion.resize(chips, from) : undefined
      if (run) watch(key, run, false)
    })
  }

  const settle = (session: LaneChipSession, count: number, rest = false) => {
    const key = session.key
    // Not part of the move: the icon changes in place, on the chip's own transition.
    if (count > 0) setResting(key, rest)
    const before = known.get(key)
    known.set(key, { count, visit: session.visit })
    const watching = before !== undefined && before.visit === session.visit && before.count !== count
    const current = moving.get(key)

    if (!watching) {
      current?.run.cancel()
      moving.delete(key)
      setShown(key, count)
      return
    }

    // The user is watching this chip while it moves: turn it round where it is, and show a new count once it has settled.
    if (current) {
      const leaving = count === 0
      if (current.leaving !== leaving) {
        current.run.reverse()
        current.leaving = leaving
      }
      current.queued = leaving ? undefined : count
      return
    }

    if (before.count === 0) {
      setShown(key, count)
      afterRender(() => {
        if (known.get(key)?.count !== count) return
        const chips = find(options.label(count))
        if (chips.length) watch(key, motion.enter(chips), false)
      })
      return
    }

    if (count === 0) {
      const chips = find(options.label(before.count))
      if (!chips.length) return setShown(key, 0)
      watch(key, motion.exit(chips), true)
      return
    }

    resize(key, before.count, count)
  }

  return {
    settle,
    pill: {
      id: options.id,
      order: options.order,
      show: (input) => {
        const count = shown[input.session.key] ?? 0
        return count > 0 ? view(count, resting[input.session.key] ?? false) : undefined
      },
      menu: options.menu,
    },
  }
}
