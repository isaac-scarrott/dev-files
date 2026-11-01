/** A mounted timeline row: its owning prompt, whether it is that prompt's own row, and its viewport box. */
export type Row = { readonly owner: string; readonly prompt: boolean; readonly top: number; readonly bottom: number }

/** Rows this close to the fold count as sitting on it. */
export const TOLERANCE = 8

/**
 * The index in `ids` of the prompt whose turn contains the fold. Rows are in document order; the first row that
 * extends below the fold owns the current turn. A row whose owner the host does not list resolves to the last listed
 * prompt before it. -1 when nothing is mounted or listed.
 */
export function currentPrompt(ids: readonly string[], rows: readonly Row[], fold: number): number {
  if (ids.length === 0) return -1
  const current = rows.find((row) => row.bottom > fold + TOLERANCE) ?? rows.at(-1)

  if (!current) return -1
  const index = ids.indexOf(current.owner)

  if (index !== -1) return index
  const next = ids.findIndex((id) => id > current.owner)

  return next === -1 ? ids.length - 1 : Math.max(0, next - 1)
}

export type RevealPlan = { readonly kind: "probe" } | { readonly kind: "load" } | { readonly kind: "top" }

/**
 * How to bring an unmounted prompt's row into the DOM: page the scroller towards it, unless it is the first prompt,
 * which either sits at the top or on an unloaded page.
 */
export function revealPlan(input: { readonly ids: readonly string[]; readonly target: string; readonly more: boolean }): RevealPlan {
  const to = input.ids.indexOf(input.target)

  if (to >= 1) return { kind: "probe" }

  return input.more ? { kind: "load" } : { kind: "top" }
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
