import { glidePlan, pickTarget, probeDirection, revealPlan, type Row, type Target } from "./target"

/** What a jump needs from the timeline it runs in. */
export type Host = {
  /** The timeline's scroll viewport. */
  readonly scroller: HTMLElement
  /** The prompts the timeline shows, in order. */
  ids(): readonly string[]
  /** Older history exists on the server. */
  more(): boolean
  loadMore(signal: AbortSignal): Promise<void>
  reducedMotion(): boolean
  /** Resolves on the next animation frame. */
  frame(): Promise<void>
  /** Called with true while older history loads, false when it is done. */
  loading?(value: boolean): void
}

export type Outcome = "done" | "none" | "aborted"

const SETTLE_FRAMES = 3
const SETTLE_LIMIT = 40
const GLIDE_LIMIT = 120
const PROBE_LIMIT = 200
const PROBE_ATTEMPTS = 3
const PAGE_LIMIT = 5

/** Mounted rows in document order, as the host's cursor reads them. */
export function readRows(scroller: HTMLElement): Row[] {
  return [...scroller.querySelectorAll<HTMLElement>("[data-message-id]")].flatMap((element) => {
    const owner = element.dataset.messageId

    if (!owner) return []
    const rect = element.getBoundingClientRect()

    return [{ owner, prompt: element.dataset.timelineRow === "UserMessage", top: rect.top, bottom: rect.bottom }]
  })
}

/** The sticky header's height: what the host's `scrollToElement` keeps a revealed prompt below. */
export function inset(scroller: HTMLElement) {
  const sticky = scroller.querySelector("[data-session-title]")

  return sticky instanceof HTMLElement ? sticky.offsetHeight : 0
}

export function anchorOf(scroller: HTMLElement, id: string) {
  return [...scroller.querySelectorAll<HTMLElement>("[data-timeline-row='UserMessage'][data-message-id]")].find(
    (element) => element.dataset.messageId === id,
  )
}

export function currentTarget(host: Host): Target {
  const box = host.scroller.getBoundingClientRect()

  return pickTarget({
    ids: host.ids(),
    rows: readRows(host.scroller),
    fold: box.top + inset(host.scroller),
    more: host.more(),
  })
}

/**
 * Tells the host the user scrolled up: its wheel handler releases the tool anchor, marks a user scroll so its next
 * navigation starts from the cursor, and unpins the timeline from its end. A programmatic scroll does none of that.
 */
export function unpin(scroller: HTMLElement) {
  scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }))
}

async function load(host: Host, signal: AbortSignal) {
  host.loading?.(true)
  try {
    await host.loadMore(signal)
  } finally {
    host.loading?.(false)
  }
}

/** The offset that puts `anchor` right under the sticky header. */
function offsetOf(scroller: HTMLElement, anchor: HTMLElement) {
  const a = anchor.getBoundingClientRect()
  const b = scroller.getBoundingClientRect()

  return Math.max(0, a.top - b.top + scroller.scrollTop - inset(scroller))
}

/**
 * Waits until the anchor is mounted and the scroll offset has held still for a few frames. Gives up early when the
 * anchor stays unmounted: the virtualizer's late render for the last probe stop can take the row out again.
 */
async function settle(host: Host, id: string, signal: AbortSignal) {
  let last = Number.NaN
  let still = 0
  let missing = 0

  for (let frame = 0; frame < SETTLE_LIMIT && !signal.aborted; frame += 1) {
    await host.frame()
    const top = host.scroller.scrollTop
    const mounted = anchorOf(host.scroller, id)
    still = mounted && top === last ? still + 1 : 0
    missing = mounted ? 0 : missing + 1
    last = top

    if (still >= SETTLE_FRAMES || missing > SETTLE_FRAMES) return
  }
}

/**
 * Pages the scroller towards the prompt, one viewport per frame, until the virtualizer mounts its row. The rows in
 * view after each frame say which way to go; an overshoot halves the step, so the row lands in view within a few
 * frames. Consecutive stops overlap, so a prompt row cannot fall between them once the virtualizer has rendered.
 */
async function probe(host: Host, id: string, signal: AbortSignal, search: { step: number; direction: -1 | 0 | 1 }) {
  const { scroller } = host
  let waited = 0

  for (let frame = 0; frame < PROBE_LIMIT && !signal.aborted; frame += 1) {
    if (anchorOf(scroller, id)) return
    const next = probeDirection(readRows(scroller), id, scroller.getBoundingClientRect())

    if (next === 0) {
      // The prompt is in view but its row has not rendered yet: a few frames, then give up.
      if ((waited += 1) > SETTLE_FRAMES) return
      await host.frame()
      continue
    }
    waited = 0
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)

    if ((next === -1 && scroller.scrollTop <= 0) || (next === 1 && scroller.scrollTop >= max)) return

    if (search.direction !== 0 && next !== search.direction) {
      search.step = Math.max(scroller.clientHeight / 4, search.step / 2)
    }
    search.direction = next
    scroller.scrollTo({ top: Math.min(max, Math.max(0, scroller.scrollTop + next * search.step)), behavior: "auto" })
    await host.frame()
  }
}

async function revealFar(host: Host, id: string, signal: AbortSignal, pages = 0): Promise<void> {
  const { scroller } = host
  const plan = revealPlan({ ids: host.ids(), target: id, more: host.more() })

  if (plan.kind === "load") {
    if (pages >= PAGE_LIMIT) return
    await load(host, signal)

    if (signal.aborted) return

    return revealFar(host, id, signal, pages + 1)
  }

  if (plan.kind === "top") {
    scroller.scrollTo({ top: 0, behavior: "auto" })

    return settle(host, id, signal)
  }

  // The step and direction carry across attempts, so a retry after an overshoot keeps the halved step.
  const search = { step: scroller.clientHeight, direction: 0 as -1 | 0 | 1 }

  for (let attempt = 0; attempt < PROBE_ATTEMPTS && !signal.aborted; attempt += 1) {
    await probe(host, id, signal, search)
    await settle(host, id, signal)

    if (anchorOf(scroller, id)) return
  }
}

/** Glides the final screen to the anchor, then corrects any drift the virtualizer's late measurements left. */
async function glide(host: Host, id: string, signal: AbortSignal) {
  const { scroller } = host
  const anchor = anchorOf(scroller, id)

  if (!anchor) return false
  const plan = glidePlan({
    from: scroller.scrollTop,
    to: offsetOf(scroller, anchor),
    viewport: scroller.clientHeight,
    max: scroller.scrollHeight - scroller.clientHeight,
    reduced: host.reducedMotion(),
  })

  if (plan.start !== undefined) {
    scroller.scrollTo({ top: plan.start, behavior: "auto" })
    await host.frame()
  }
  scroller.scrollTo({ top: plan.to, behavior: plan.behavior })

  if (plan.behavior === "auto") return true

  let last = Number.NaN
  let still = 0

  for (let frame = 0; frame < GLIDE_LIMIT && !signal.aborted; frame += 1) {
    await host.frame()
    const top = scroller.scrollTop
    still = top === last ? still + 1 : 0
    last = top

    if (still >= SETTLE_FRAMES) break
  }

  if (signal.aborted) return true
  const landed = anchorOf(scroller, id)

  if (!landed) return true
  const to = Math.min(offsetOf(scroller, landed), Math.max(0, scroller.scrollHeight - scroller.clientHeight))

  // Mounting the turn above shifts the anchor after the glide lands; a second short glide settles it without a jolt.
  if (Math.abs(to - scroller.scrollTop) > 2) scroller.scrollTo({ top: to, behavior: plan.behavior })

  return true
}

/** Takes the timeline to the nearest prompt above the fold. */
export async function jump(host: Host, signal: AbortSignal): Promise<Outcome> {
  let target = currentTarget(host)

  for (let pages = 0; target?.kind === "load" && pages < PAGE_LIMIT; pages += 1) {
    await load(host, signal)

    if (signal.aborted) return "aborted"
    target = currentTarget(host)
  }

  if (!target || target.kind !== "message") return "none"
  const { id } = target
  unpin(host.scroller)

  if (!anchorOf(host.scroller, id)) {
    await revealFar(host, id, signal)

    if (signal.aborted) return "aborted"
  }

  if (!(await glide(host, id, signal))) return "none"

  return signal.aborted ? "aborted" : "done"
}
