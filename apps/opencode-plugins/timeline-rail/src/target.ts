/** A mounted timeline row: its owning prompt, whether it is that prompt's own row, and its viewport box. */
export type Row = { readonly owner: string; readonly prompt: boolean; readonly top: number; readonly bottom: number }

/** How far below the sticky header's bottom edge the reading line sits: a prompt landed under the header is at or above it. */
export const READING_OFFSET = 8
/** Pixels of scroll slack that still count as the very bottom (fractional scroll offsets, rounding). */
const END_SLACK = 2

/** The scroller's offset state: `top` is `scrollTop`, `max` is `scrollHeight - clientHeight`. */
export type Scroll = { readonly top: number; readonly max: number }

/** Whether the scroller is within the slack of its very end (a chat that fits counts). */
export function atEnd(scroll: Scroll): boolean {
  return scroll.max <= END_SLACK || scroll.max - scroll.top <= END_SLACK
}

/**
 * The prompt a jump chose, held while the scroller sits at its very end. At the end the reading rule names the last
 * prompt, but a jump to an earlier one cannot move there when its row is already within the final screen (the scroll
 * maximum clamps it): the chosen prompt stays lit until the user scrolls or the scroller leaves the end. `chosen` is
 * undefined when nothing is held; `computed` is the reading rule's answer.
 */
export function heldPrompt(input: { readonly chosen: number | undefined; readonly computed: number; readonly count: number; readonly scroll: Scroll }): number {
  const { chosen } = input

  return chosen !== undefined && chosen >= 0 && chosen < input.count && atEnd(input.scroll) ? chosen : input.computed
}

/**
 * The one active prompt: the turn being read, as an index in `ids` (-1 only when `ids` is empty). It is the owner of the
 * last mounted row that starts at or above the reading line, so a long reply keeps its prompt active though the prompt's
 * own row is scrolled far above (and may be unmounted). Rows are in document order and each carries its turn's prompt id.
 *
 * Edges: a chat that fits, or scrolled to its very end, is on the last prompt; above every row, or on a turn older than
 * `ids`, the first. An owner the list does not hold (a peer message, a reverted prompt) is the listed prompt before it.
 * When every mounted row starts below the line, a prompt row there means the line is inside the turn before it, and any
 * other row means its prompt is above: the prompt itself.
 */
export function activePrompt(ids: readonly string[], rows: readonly Row[], line: number, scroll: Scroll): number {
  const last = ids.length - 1

  if (last < 0) return -1

  if (atEnd(scroll)) return last
  let at: Row | undefined

  for (const row of rows) {
    if (row.top > line) break
    at = row
  }
  const row = at ?? rows[0]

  if (!row) return 0
  const exact = ids.indexOf(row.owner)
  // The listed prompt before an owner the list does not hold; -1 when the owner predates the list.
  const before = exact !== -1 ? exact : ids.findIndex((id) => id > row.owner)
  const index = exact !== -1 ? exact : before === -1 ? last : before - 1

  // Every row starts below the line and the first is a prompt: the line is inside the turn before it.
  return Math.min(last, Math.max(0, !at && row.prompt && exact !== -1 ? exact - 1 : index))
}

/**
 * Which way the prompt lies from the rows in view. Every row carries its turn's prompt id, so rows of the target's
 * turn without its prompt row mean the prompt is above them, and rows of earlier turns mean it is below. Only rows
 * intersecting the viewport count: the virtualizer keeps the last turn's final row mounted far below whatever is
 * shown, and it would otherwise read as "a later turn is below" at every position. Rows straddling the target
 * give 0: the prompt is in view and its row is about to mount.
 */
export function probeDirection(
  rows: readonly Row[],
  target: string,
  box: { readonly top: number; readonly bottom: number },
): -1 | 0 | 1 {
  const shown = rows.filter((row) => row.bottom > box.top && row.top < box.bottom)
  const list = shown.length ? shown : rows
  const first = list[0]
  const last = list.at(-1)

  if (!first || first.owner >= target) return -1

  if (last && last.owner < target) return 1

  return 0
}

/**
 * How to move the scroller to `to`: a smooth glide, with an instant jump to one viewport away first when the distance
 * would stream more than two screens through the virtualizer. Reduced motion jumps straight there.
 */
export function glidePlan(input: {
  readonly from: number
  readonly to: number
  readonly viewport: number
  readonly max: number
  readonly reduced: boolean
}): { readonly to: number; readonly start?: number; readonly behavior: ScrollBehavior } {
  const to = Math.min(Math.max(0, input.to), Math.max(0, input.max))

  if (input.reduced) return { to, behavior: "auto" }

  if (Math.abs(to - input.from) <= input.viewport * 2) return { to, behavior: "smooth" }

  const start = input.from > to ? Math.min(input.max, to + input.viewport) : Math.max(0, to - input.viewport)

  return { to, start, behavior: "smooth" }
}

/**
 * Where prompt `index` of `count` probably sits: its share of the content height. The virtualizer's total is an
 * estimate that sharpens as rows are measured, so this lands near the prompt, not on it; `correction` does the rest.
 */
export function seekTop(input: {
  readonly index: number
  readonly count: number
  readonly scrollHeight: number
  readonly clientHeight: number
}): number {
  const max = Math.max(0, input.scrollHeight - input.clientHeight)

  return Math.min(max, Math.max(0, Math.round((input.index / Math.max(1, input.count)) * input.scrollHeight)))
}

/**
 * How far to scroll from where the rows in view are, to bring prompt `target` to them: the index gap to the middle of
 * the turns shown, times the pixels a prompt takes. That height is measured between mounted prompt rows when two or more
 * are mounted, else `fallback` (content height over prompt count). 0 when the target's turn is already in view (its row
 * is about to mount), undefined when no listed row is in view.
 */
export function correction(input: {
  readonly rows: readonly Row[]
  readonly indexOf: ReadonlyMap<string, number>
  readonly target: number
  readonly fallback: number
  readonly box: { readonly top: number; readonly bottom: number }
}): number | undefined {
  let lo = Number.POSITIVE_INFINITY
  let hi = -1

  for (const row of input.rows) {
    if (row.bottom <= input.box.top || row.top >= input.box.bottom) continue
    const index = input.indexOf.get(row.owner)

    if (index === undefined) continue
    lo = Math.min(lo, index)
    hi = Math.max(hi, index)
  }

  if (hi === -1) return undefined

  if (input.target >= lo && input.target <= hi) return 0
  const prompts = input.rows.flatMap((row) => {
    const index = row.prompt ? input.indexOf.get(row.owner) : undefined

    return index === undefined ? [] : [{ index, top: row.top }]
  })
  const first = prompts[0]
  const last = prompts.at(-1)
  const measured = first && last && last.index > first.index ? (last.top - first.top) / (last.index - first.index) : 0
  const pixels = measured > 0 ? measured : input.fallback

  return Math.round((input.target - (lo + hi) / 2) * pixels)
}
