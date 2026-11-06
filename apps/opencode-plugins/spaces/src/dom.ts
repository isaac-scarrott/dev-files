// Hides the sidebar rows that belong to another space. The host does not know the list is filtered (see DESIGN.md), so the
// only lever is the row element: one attribute per row plus one rule in our style sheet. A pass over 119 rows costs about
// 0.1ms, and because the observer filters attributes it is never woken by our own writes.

export const HIDDEN = "data-spaces-hidden"
export const ROW = '[data-slot="vertical-tabs"] [data-tab-key]'

export interface RowFilter {
  /** Starts watching the sidebar and applies a first pass. */
  start(sidebar: HTMLElement): void
  /** Re-applies on the next frame; safe to call on every reactive change. */
  poke(): void
  /** Applies immediately, cancelling a pending frame. */
  applyNow(): void
  /** Stops watching and shows every row again. */
  stop(): void
}

export function createRowFilter(doc: Document, compute: () => ReadonlySet<string>): RowFilter {
  const view = doc.defaultView!
  let frame: number | undefined
  let observer: MutationObserver | undefined

  const apply = () => {
    frame = undefined
    const hidden = compute()
    for (const row of doc.querySelectorAll<HTMLElement>(ROW)) {
      const key = row.getAttribute("data-tab-key")
      if (key === null) continue
      row.toggleAttribute(HIDDEN, hidden.has(key))
    }
  }

  const poke = () => {
    if (frame !== undefined) return
    frame = view.requestAnimationFrame(apply)
  }

  return {
    start(sidebar) {
      observer?.disconnect()
      observer = new MutationObserver(poke)
      observer.observe(sidebar, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tab-key"] })
      poke()
    },
    poke,
    applyNow() {
      if (frame !== undefined) {
        view.cancelAnimationFrame(frame)
        frame = undefined
      }
      apply()
    },
    stop() {
      observer?.disconnect()
      observer = undefined
      if (frame !== undefined) {
        view.cancelAnimationFrame(frame)
        frame = undefined
      }
      for (const row of doc.querySelectorAll<HTMLElement>(ROW)) row.removeAttribute(HIDDEN)
    },
  }
}
