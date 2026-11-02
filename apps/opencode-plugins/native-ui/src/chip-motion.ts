// How a composer chip comes and goes. The host animates none of it: a plugin pill is inserted and removed with no motion, and
// the row does not reflow smoothly (only the host's own activity capsule fades in, 150ms). So each chip collapses its own
// box (width, padding, border, the 8px lane gap it leaves, opacity, scale) on the Web Animations clock, and the flex row
// moves its neighbours, the host's capsule included, on every frame without any plugin touching them.

export const CHIP_MS = 200
/** animation.md: the ease-out for entrances and exits. */
export const CHIP_EASE = "cubic-bezier(0.23, 1, 0.32, 1)"
/** The host's pill container is `gap-2`; a collapsing box takes half of it off each side so the gap goes with it. */
const GAP_HALF = "-4px"
const CONTAINER = '[data-component="session-plugin-pills"]'

export interface ChipRun {
  /** Plays back from where it is, so a chip that is leaving can come back without a jump. */
  reverse(): void
  /** Ends the run where it stands and removes everything it set. */
  cancel(): void
  /** Runs once, when the run reaches its end; not when it is cancelled. */
  onFinish(fn: () => void): void
}

export interface ChipMotion {
  enter(chips: readonly HTMLElement[]): ChipRun
  exit(chips: readonly HTMLElement[]): ChipRun
  /** The chip's text changed width; `from` is its width before. Undefined when there is nothing to animate. */
  resize(chips: readonly HTMLElement[], from: number): ChipRun | undefined
}

export function reducedMotion(doc: Document = document): boolean {
  return doc.documentElement.dataset.motion === "reduce" || doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

const px = (value: string) => Number.parseFloat(value) || 0

function frames(chip: HTMLElement, reduced: boolean) {
  if (reduced) return { closed: { opacity: 0 }, open: { opacity: 1 } }
  const style = chip.ownerDocument.defaultView!.getComputedStyle(chip)
  return {
    closed: { width: "0px", paddingLeft: "0px", paddingRight: "0px", borderLeftWidth: "0px", borderRightWidth: "0px", marginLeft: GAP_HALF, marginRight: GAP_HALF, opacity: 0, transform: "scale(0.97)" },
    open: {
      width: `${chip.getBoundingClientRect().width}px`,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      borderLeftWidth: style.borderLeftWidth,
      borderRightWidth: style.borderRightWidth,
      marginLeft: "0px",
      marginRight: "0px",
      opacity: 1,
      transform: "scale(1)",
    },
  }
}

class Run implements ChipRun {
  private ended = false
  private readonly listeners: (() => void)[] = []

  constructor(
    private readonly animations: readonly Animation[],
    private readonly release: () => void,
    /** A leaving chip takes no pointer or focus; the elements follow the run's direction as it reverses. */
    private readonly chips: readonly HTMLElement[] = [],
    private leaving = false,
  ) {
    const last = animations.at(-1)
    last?.addEventListener("finish", () => {
      if (this.ended) return
      this.finish()
    })
    if (!last) queueMicrotask(() => this.finish())
  }

  private finish() {
    this.ended = true
    this.release()
    for (const fn of this.listeners) fn()
    for (const animation of this.animations) animation.cancel()
  }

  reverse() {
    if (this.ended) return
    this.leaving = !this.leaving
    for (const chip of this.chips) chip.inert = this.leaving
    for (const animation of this.animations) animation.reverse()
  }

  cancel() {
    if (this.ended) return
    this.ended = true
    this.release()
    for (const animation of this.animations) animation.cancel()
  }

  onFinish(fn: () => void) {
    this.listeners.push(fn)
  }
}

/** A chip alone in the host's pill container has the container's lane gap to give back as well. */
function alone(chip: HTMLElement): HTMLElement | undefined {
  const container = chip.parentElement
  return container?.matches(CONTAINER) && container.children.length === 1 ? container : undefined
}

function play(chips: readonly HTMLElement[], direction: "in" | "out"): ChipRun {
  const reduced = reducedMotion(chips[0]?.ownerDocument)
  const animations: Animation[] = []
  const undo: (() => void)[] = []
  const options: KeyframeAnimationOptions = { duration: reduced ? 150 : CHIP_MS, easing: CHIP_EASE, fill: "both" }
  for (const chip of chips) {
    const { closed, open } = frames(chip, reduced)
    const lone = reduced ? undefined : alone(chip)
    const box = lone ? { ...closed, marginLeft: "0px", marginRight: "0px" } : closed
    const hold = chip.style.overflow
    chip.style.overflow = "hidden"
    if (direction === "out") chip.inert = true
    undo.push(() => {
      chip.style.overflow = hold
      chip.inert = false
    })
    animations.push(chip.animate(direction === "in" ? [box, open] : [open, box], options))
    if (lone) {
      const margins = { marginLeft: GAP_HALF, marginRight: GAP_HALF }
      const rest = { marginLeft: "0px", marginRight: "0px" }
      animations.push(lone.animate(direction === "in" ? [margins, rest] : [rest, margins], options))
    }
  }
  return new Run(animations, () => undo.forEach((fn) => fn()), chips, direction === "out")
}

export const domMotion: ChipMotion = {
  enter: (chips) => play(chips, "in"),
  exit: (chips) => play(chips, "out"),
  resize(chips, from) {
    if (reducedMotion(chips[0]?.ownerDocument)) return undefined
    const animations: Animation[] = []
    const undo: (() => void)[] = []
    for (const chip of chips) {
      const to = chip.getBoundingClientRect().width
      if (Math.abs(to - from) < 0.5) continue
      const hold = chip.style.overflow
      chip.style.overflow = "hidden"
      undo.push(() => (chip.style.overflow = hold))
      animations.push(chip.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: CHIP_MS, easing: CHIP_EASE }))
    }
    return animations.length ? new Run(animations, () => undo.forEach((fn) => fn())) : undefined
  },
}
