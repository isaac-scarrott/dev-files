import { glidePlan, hostCursor, pickTarget, revealPlan, type Row, type Target } from "./target"

/** What a jump needs from the timeline it runs in. */
export type Host = {
  /** The timeline's scroll viewport. */
  readonly scroller: HTMLElement
  /** The prompts the timeline shows, in order. */
  ids(): readonly string[]
  /** Older history exists on the server. */
  more(): boolean
  loadMore(signal: AbortSignal): Promise<void>
  /** Runs one of the app's commands; false when unavailable. */
  run(command: string): boolean
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
const PROBE_LIMIT = 60
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

/** Waits until the anchor is mounted and the scroll offset has held still for a few frames. */
async function settle(host: Host, id: string, signal: AbortSignal) {
  let last = Number.NaN
  let still = 0

  for (let frame = 0; frame < SETTLE_LIMIT && !signal.aborted; frame += 1) {
    await host.frame()
    const top = host.scroller.scrollTop
    still = anchorOf(host.scroller, id) && top === last ? still + 1 : 0
    last = top

    if (still >= SETTLE_FRAMES) return
  }
}

/** Last resort when the host's commands are unavailable: page the scroller towards the prompt until its row mounts. */
async function probe(host: Host, id: string, signal: AbortSignal) {
  const { scroller } = host

  for (let frame = 0; frame < PROBE_LIMIT && !signal.aborted; frame += 1) {
    if (anchorOf(scroller, id)) return
    const rows = readRows(scroller)
    const first = rows[0]
    const last = rows.at(-1)
    const step = scroller.clientHeight * 3

    // Rows of the target's own turn without its prompt row mean the prompt is above them.
    if (!first || first.owner >= id) {
      if (scroller.scrollTop <= 0) return
      scroller.scrollTo({ top: Math.max(0, scroller.scrollTop - step), behavior: "auto" })
    } else if (last && last.owner < id) {
      scroller.scrollTo({ top: scroller.scrollTop + step, behavior: "auto" })
    } else return
    await host.frame()
  }
}

async function revealFar(host: Host, id: string, signal: AbortSignal, pages = 0): Promise<void> {
  const { scroller } = host
  const plan = revealPlan({
    ids: host.ids(),
    cursor: hostCursor(readRows(scroller), scroller.getBoundingClientRect()),
    target: id,
    more: host.more(),
  })

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

  for (const command of plan.commands) {
    if (!host.run(command)) return probe(host, id, signal)
  }

  return settle(host, id, signal)
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

  if (Math.abs(to - scroller.scrollTop) > 2) scroller.scrollTo({ top: to, behavior: "auto" })

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
