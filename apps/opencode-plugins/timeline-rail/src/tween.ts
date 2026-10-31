/** Ease-out for a reveal: fast off the mark, long settle (the quartic stand-in for the host's `--ease-out`). */
export const easeOut = (t: number) => 1 - (1 - t) ** 4

/** Longer trips take longer, but never past 420ms: a jump is a navigation, not a scene. */
export function tweenDuration(distance: number) {
  return Math.round(Math.min(420, 180 + Math.abs(distance) * 0.12))
}

/** What a scroll tween needs; every member is injectable so it runs under test without a layout engine. */
export type TweenHost = {
  readonly scroller: HTMLElement
  frame(): Promise<void>
  now(): number
}

/** Events that mean the user took the wheel: the tween stops and leaves the scroller where their input put it. */
const TAKEOVER = ["wheel", "touchstart", "pointerdown", "keydown"] as const

/**
 * Scrolls to `to` along an ease-out curve, one write of `scrollTop` per frame. Stops at once when the user scrolls
 * or presses a key (so it never fights them) or the signal aborts. Resolves true when it reached the target.
 */
export async function tweenScroll(host: TweenHost, to: number, signal: AbortSignal): Promise<boolean> {
  const { scroller } = host
  const from = scroller.scrollTop
  const duration = tweenDuration(to - from)
  let taken = false
  const take = () => void (taken = true)

  for (const type of TAKEOVER) scroller.addEventListener(type, take, { passive: true })

  try {
    const start = host.now()

    for (;;) {
      await host.frame()

      if (taken || signal.aborted) return false
      const t = Math.min(1, (host.now() - start) / duration)

      scroller.scrollTo({ top: from + (to - from) * easeOut(t), behavior: "auto" })
      if (t >= 1) return true
    }
  } finally {
    for (const type of TAKEOVER) scroller.removeEventListener(type, take)
  }
}
