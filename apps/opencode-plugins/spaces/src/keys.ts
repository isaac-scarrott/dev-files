// The host walks its own tab list, so its navigation keys reach sessions the filter hid. This intercepts those keys while
// spaces are filtering, and sends them to the active space's rows instead. It is a capture listener above the host's
// handlers; the guard reports itself off if a press still lands outside the space (see `verify`).

export interface KeyGuardOptions {
  /** The visible tab keys, in sidebar order. */
  visible(): readonly string[]
  /** The pressed session's tab key, when it is in the active space. */
  focus(key: string): void
  /** The tab key of the space's session on screen, when it has one. */
  focused?(): string | undefined
  /** The key was ours: it did not do what the host would have. */
  handled(): void
  /** The host acted anyway and the routed tab left the space. */
  lost(): void
}

const TAB_DIGITS = /^[1-9]$/

/**
 * Handles `Alt+ArrowUp/Down` and `Mod+1..9` the way the host does, but over the rows on screen. Returns the listener so
 * the caller can detach it, and whether the press was consumed.
 */
export function createKeyGuard(options: KeyGuardOptions) {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement | null
    if (target?.closest?.("input, textarea, [contenteditable=true], [role=textbox]")) return
    const mod = event.metaKey || event.ctrlKey
    const digit = TAB_DIGITS.test(event.key) && mod && !event.altKey && !event.shiftKey
    const arrow = event.altKey && !event.metaKey && !event.ctrlKey && (event.key === "ArrowDown" || event.key === "ArrowUp")
    if (!digit && !arrow) return
    const keys = options.visible()
    if (keys.length === 0) return

    if (digit) {
      const index = Number(event.key) - 1
      const key = keys[index]
      if (!key) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      options.focus(key)
      options.handled()
      return
    }

    const current = options.focused?.()
    const at = current ? keys.indexOf(current) : -1
    const step = event.key === "ArrowDown" ? 1 : -1
    const index = at < 0 ? (step > 0 ? 0 : keys.length - 1) : (at + step + keys.length) % keys.length
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    options.focus(keys[index]!)
    options.handled()
  }
  return {
    attach(doc: Document) {
      doc.addEventListener("keydown", onKey, true)
      return () => doc.removeEventListener("keydown", onKey, true)
    },
  }
}
