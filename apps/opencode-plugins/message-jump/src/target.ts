/** A mounted timeline row: its owning prompt, whether it is that prompt's own row, and its viewport box. */
export type Row = { readonly owner: string; readonly prompt: boolean; readonly top: number; readonly bottom: number }

export type Target = { readonly kind: "message"; readonly id: string } | { readonly kind: "load" } | undefined

/** Rows this close to the fold count as sitting on it. */
export const TOLERANCE = 8

/** The prompts the host's timeline shows, in order: `visibleUserMessages` of `app/src/session/session-domain.ts`. */
export function candidates(messages: readonly { id: string; type: string }[], revertMessageID?: string): string[] {
  const ids = messages.filter((message) => message.type === "user").map((message) => message.id)

  return revertMessageID ? ids.filter((id) => id < revertMessageID) : ids
}

/**
 * The nearest candidate prompt above the fold. Rows are in document order. The first row that extends below the fold
 * owns the current turn; when that row is the prompt itself and starts on or below the fold, the target is the prompt
 * before it, otherwise the current prompt is above (scrolled off or unmounted) and is the target.
 */
export function pickTarget(input: {
  readonly ids: readonly string[]
  readonly rows: readonly Row[]
  readonly fold: number
  readonly more: boolean
}): Target {
  const { ids, rows, fold, more } = input

  if (ids.length === 0) return undefined

  const before = (index: number): Target =>
    index > 0 ? { kind: "message", id: ids[index - 1]! } : more ? { kind: "load" } : undefined

  const first = rows.find((row) => row.bottom > fold + TOLERANCE)
  const current = first ?? rows.at(-1)

  if (!current) return undefined

  const index = ids.indexOf(current.owner)

  // A row whose owner the host does not list: the last listed prompt before it is the one above.
  if (index === -1) {
    const next = ids.findIndex((id) => id > current.owner)

    return before(next === -1 ? ids.length : next)
  }

  if (first && first.prompt && first.top >= fold - TOLERANCE) return before(index)

  return { kind: "message", id: current.owner }
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
