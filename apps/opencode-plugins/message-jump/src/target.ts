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

/** The host's `cursor()` (`app/src/session/timeline/interaction.ts`): the prompt owning the line 100px below the top. */
export function hostCursor(rows: readonly Row[], box: { readonly top: number; readonly bottom: number }) {
  const line = box.top + 100
  const shown = rows.filter((row) => row.bottom > box.top && row.top < box.bottom)
  const hit = shown.find((row) => row.top <= line && row.bottom >= line)

  if (hit) return hit.owner

  const near = [...shown].sort((a, b) => {
    const aDistance = Math.abs(a.top - line)
    const bDistance = Math.abs(b.top - line)

    if (aDistance !== bDistance) return aDistance - bDistance

    return a.top - b.top
  })[0]

  if (near) return near.owner

  return rows.filter((row) => row.top <= line).at(-1)?.owner ?? rows[0]?.owner
}

export type RevealPlan =
  | { readonly kind: "commands"; readonly commands: readonly ("message.previous" | "message.next")[] }
  | { readonly kind: "load" }
  | { readonly kind: "top" }

/**
 * The host commands that put `target` under the header. `message.previous` steps the host's `navigateMessage(-1)`
 * from its cursor, then from the prompt it last navigated to, so `cursor - target` calls land on the target. A cursor
 * already on the target's turn steps back once and forward once.
 */
export function revealPlan(input: {
  readonly ids: readonly string[]
  readonly cursor: string | undefined
  readonly target: string
  readonly more: boolean
}): RevealPlan {
  const { ids, cursor, target, more } = input
  const to = ids.indexOf(target)
  const at = cursor ? ids.indexOf(cursor) : -1
  const base = at === -1 ? ids.length : at
  const steps = base - to

  if (steps >= 1) return { kind: "commands", commands: Array.from({ length: steps }, () => "message.previous") }

  if (to >= 1) return { kind: "commands", commands: ["message.previous", "message.next"] }

  return more ? { kind: "load" } : { kind: "top" }
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
