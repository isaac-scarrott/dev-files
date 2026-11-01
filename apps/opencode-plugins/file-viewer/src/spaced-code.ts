import { claim } from "./expand"

/**
 * WORKAROUND against a host limit; see DESIGN.md "Spaced inline code". OpenCode 2.2.5 offers an inline code span to the
 * link handlers only when its text has no whitespace, so `~/Movies/My Video.mp4` stays plain code. This marks such a span
 * with the host's own attribute (`data-inline-code-kind="path"`) the moment the pointer reaches it, once the file exists.
 * The host's styles and click handler then treat the span like any other path, and the click reaches our LinkHandler.
 *
 * Nothing runs while rows mount or scroll: three delegated listeners on the document, and the span is resolved only when
 * it is pointed at or clicked. The host reads the attribute at click time (`localLinkTarget` in
 * `session-ui/src/components/markdown.tsx`), so a mark set on `pointerover` or `pointerdown` is seen by the click that
 * follows. A click that lands while the first check is still running opens through `open` instead; the host sees an
 * unmarked span for that click and does nothing, so nothing opens twice.
 *
 * Remove this file when the host's inline code gate accepts whitespace (its `inlineCodeKind` in
 * `session-ui/src/components/markdown-inline-code-kind.ts`).
 */

const MARKDOWN = '[data-component="markdown"]'
const KIND = "data-inline-code-kind"
const MARK = "data-fv-spaced"
const MAX_TEXT = 400

export interface Checker {
  /** The href to open when the file exists; undefined otherwise. */
  target(href: string): Promise<string | undefined>
  /** The cached answer, without waiting; undefined when unknown. */
  peek(href: string): string | undefined
  /** Opens a spaced path through the plugin's own LinkHandler (the host's click handler saw no mark). */
  open(href: string): void
}

/**
 * The text of an inline code span the host left alone and this plugin might mark, or undefined. Pure string and
 * attribute tests, no layout reads: the host's own mark (`data-inline-code-kind` without ours), a parent `pre`, an
 * enclosing link, a place outside message markdown, or a part that is still streaming all decline.
 */
export function eligible(code: Element): string | undefined {
  if (code.hasAttribute(KIND) && !code.hasAttribute(MARK)) return

  const root = code.closest(MARKDOWN)

  // While a part streams the host re-renders its blocks on every delta and clears the kind attribute on every span, so a
  // mark there would flicker; its own paths stay plain until the part completes, and so do ours.
  if (code.parentElement?.localName === "pre" || code.closest("a") || !root || root.hasAttribute("data-streaming")) return

  const text = code.textContent?.trim() ?? ""

  if (text.length <= 4 || text.length > MAX_TEXT || !/\s/.test(text) || claim(text)?.spaced !== true) return

  return text
}

export function watchSpacedCode(doc: Document, checker: Checker): () => void {
  let stopped = false

  const apply = (code: Element, on: boolean) => {
    if (on) {
      if (code.getAttribute(KIND) !== "path") code.setAttribute(KIND, "path")
      if (!code.hasAttribute(MARK)) code.setAttribute(MARK, "")
    } else if (code.hasAttribute(MARK)) {
      code.removeAttribute(MARK)
      if (code.getAttribute(KIND) === "path") code.removeAttribute(KIND)
    }
  }

  /** Marks the span: at once when the answer is cached (true), else after the host's listing answers (a promise). */
  const resolve = (code: Element, text: string): true | Promise<boolean> => {
    if (checker.peek(text) !== undefined) {
      apply(code, true)

      return true
    }

    return checker.target(text).then((target) => {
      if (stopped || !code.isConnected || code.textContent?.trim() !== text) return false

      apply(code, target !== undefined)

      return target !== undefined
    })
  }

  // Inline code holds text only, so the span itself is the event target.
  const span = (target: EventTarget | null) => (target instanceof Element && target.localName === "code" ? target : undefined)

  const onPointer = (event: Event) => {
    const code = span(event.target)
    const text = code && eligible(code)

    if (text) void resolve(code, text)
  }

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.defaultPrevented) return

    const code = span(event.target)

    // A marked span (ours or the host's) is the host's click.
    if (!code || code.hasAttribute(KIND)) return

    const text = eligible(code)

    if (!text) return

    const result = resolve(code, text)

    // Marked before the host's bubbling handler runs, so that opens it. Otherwise this click is ours once the answer lands.
    if (result !== true) void result.then((ok) => ok && !stopped && checker.open(text))
  }

  const options = { capture: true, passive: true } as const
  doc.addEventListener("pointerover", onPointer, options)
  doc.addEventListener("pointerdown", onPointer, options)
  doc.addEventListener("click", onClick, true)

  return () => {
    stopped = true
    doc.removeEventListener("pointerover", onPointer, options)
    doc.removeEventListener("pointerdown", onPointer, options)
    doc.removeEventListener("click", onClick, true)

    for (const code of doc.querySelectorAll(`[${MARK}]`)) apply(code, false)
  }
}
