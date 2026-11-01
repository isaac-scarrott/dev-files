import { correction, glidePlan, probeDirection, seekTop, type Row } from "./target"

/** What a jump needs from the timeline it runs in. */
export type Host = {
  /** The timeline's scroll viewport. */
  readonly scroller: HTMLElement
  /** The prompts the timeline shows, in order. */
  ids(): readonly string[]
  reducedMotion(): boolean
  /** Resolves on the next animation frame. */
  frame(): Promise<void>
  /** Scrolls to `to` along the host's own ease-out; absent, the browser's smooth scroll is used. */
  tween?(to: number, signal: AbortSignal): Promise<boolean>
}

export type Outcome = "done" | "none" | "aborted"

const SETTLE_FRAMES = 3
const SETTLE_LIMIT = 40
const GLIDE_LIMIT = 120
const PROBE_LIMIT = 200
const PROBE_ATTEMPTS = 3
/** A pre-seek pays off when probing would take this many viewports of one-per-frame paging or more. */
const SEEK_VIEWPORTS = 20
/** Correction rounds after the seek, each waiting for the virtualizer to render the new position. */
const SEEK_ROUNDS = 24
const RENDER_FRAMES = 2
/** Reveal-and-glide rounds before a jump settles for where it is. */
const LAND_ROUNDS = 4

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

/**
 * Tells the host the user scrolled up: its wheel handler releases the tool anchor, marks a user scroll so its next
 * navigation starts from the cursor, and unpins the timeline from its end. A programmatic scroll does none of that.
 */
export function unpin(scroller: HTMLElement) {
  scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }))
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

/**
 * Far anchors: one write to the estimated offset of the prompt (its share of the content height), then a few
 * corrections that move by the index gap times the measured prompt height until the prompt's turn is in view. The probe
 * then mounts and settles it with small steps. Skipped when the prompt is near enough for the probe to reach it quickly.
 */
async function seek(host: Host, id: string, signal: AbortSignal) {
  const { scroller } = host
  const ids = host.ids()
  const target = ids.indexOf(id)
  const to = seekTop({ index: target, count: ids.length, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight })

  if (Math.abs(to - scroller.scrollTop) < SEEK_VIEWPORTS * scroller.clientHeight) return
  const indexOf = new Map(ids.map((owner, index) => [owner, index] as const))
  const fallback = scroller.scrollHeight / Math.max(1, ids.length)
  const max = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const render = async () => {
    for (let frame = 0; frame < RENDER_FRAMES && !signal.aborted; frame += 1) await host.frame()
  }

  scroller.scrollTo({ top: to, behavior: "auto" })
  await render()

  for (let round = 0; round < SEEK_ROUNDS && !signal.aborted; round += 1) {
    if (anchorOf(scroller, id)) return
    const delta = correction({ rows: readRows(scroller), indexOf, target, fallback, box: scroller.getBoundingClientRect() })

    if (delta === 0) return

    if (delta === undefined) {
      await render()
      continue
    }
    const next = Math.min(max(), Math.max(0, scroller.scrollTop + delta))

    if (next === scroller.scrollTop) return
    scroller.scrollTo({ top: next, behavior: "auto" })
    await render()
  }
}

async function revealFar(host: Host, id: string, signal: AbortSignal): Promise<void> {
  const { scroller } = host

  await seek(host, id, signal)

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
  // The host's curve when it supplies one; otherwise the browser's own smooth scroll, which has no ease-out to match.
  const move = async (to: number) => {
    if (plan.behavior === "auto") {
      scroller.scrollTo({ top: to, behavior: "auto" })

      return true
    }

    if (host.tween) return host.tween(to, signal)
    scroller.scrollTo({ top: to, behavior: plan.behavior })
    let last = Number.NaN
    let still = 0

    for (let frame = 0; frame < GLIDE_LIMIT && !signal.aborted; frame += 1) {
      await host.frame()
      const top = scroller.scrollTop
      still = top === last ? still + 1 : 0
      last = top

      if (still >= SETTLE_FRAMES) break
    }

    return true
  }

  // false: the user scrolled mid-glide, and their scroll stands.
  if (!(await move(plan.to)) || plan.behavior === "auto" || signal.aborted) return true
  const landed = anchorOf(scroller, id)

  if (!landed) return true
  const to = Math.min(offsetOf(scroller, landed), Math.max(0, scroller.scrollHeight - scroller.clientHeight))

  // Mounting the turn above shifts the anchor after the glide lands; a second short glide settles it without a jolt.
  if (Math.abs(to - scroller.scrollTop) > 2) await move(to)

  return true
}

/** Events that mean the user took the wheel: the jump stops where their input put the scroller. */
const TAKEOVER = ["wheel", "touchstart", "pointerdown", "keydown"] as const

/** Takes the timeline to the prompt `id`, landing it right under the sticky header. */
export async function jumpTo(host: Host, id: string, outer: AbortSignal): Promise<Outcome> {
  if (!host.ids().includes(id)) return "none"
  unpin(host.scroller)
  // The user's own wheel, touch or key ends the jump, whichever phase it is in; the plugin's own unpin ran before this.
  const own = new AbortController()
  const stop = () => own.abort()
  const signal = AbortSignal.any([outer, own.signal])

  for (const type of TAKEOVER) host.scroller.addEventListener(type, stop, { passive: true })

  try {
    // Rows above a far prompt are estimated until they mount, so the offset a glide aimed at can be off once they are
    // measured, and the prompt can unmount again: reveal and glide once more from where it landed, a few times at most.
    for (let round = 0; round < LAND_ROUNDS; round += 1) {
      if (!anchorOf(host.scroller, id)) {
        await revealFar(host, id, signal)

        if (signal.aborted) return "aborted"
      }

      if (!(await glide(host, id, signal))) return "none"

      if (signal.aborted) return "aborted"
      const landed = anchorOf(host.scroller, id)

      if (landed && Math.abs(offsetOf(host.scroller, landed) - host.scroller.scrollTop) <= 2) break
    }

    return signal.aborted ? "aborted" : "done"
  } finally {
    for (const type of TAKEOVER) host.scroller.removeEventListener(type, stop)
  }
}
