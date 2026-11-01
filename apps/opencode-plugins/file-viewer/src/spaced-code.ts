import { claim } from "./expand"

/**
 * WORKAROUND against a host limit; see DESIGN.md "Spaced inline code". OpenCode 2.2.5 only offers an inline code span to the
 * link handlers when its text has no whitespace, so `~/Movies/My Video.mp4` stays plain code. This marks such spans with
 * the host's own attribute (`data-inline-code-kind="path"`) once the file exists. The host's styles and click handler then
 * treat the span like any other path, and the click reaches our LinkHandler: no listener of our own.
 *
 * Remove this file when the host's inline code gate accepts whitespace (its `inlineCodeKind` in
 * `session-ui/src/components/markdown-inline-code-kind.ts`).
 */

const MARKDOWN = '[data-component="markdown"]'
const KIND = "data-inline-code-kind"
const MARK = "data-fv-spaced"
const MAX_TEXT = 400
const BUDGET = 150

export interface Checker {
  /** The href to open when the file exists; undefined otherwise. */
  target(href: string): Promise<string | undefined>
  peek(href: string): string | undefined
}

/** A span the host left alone that this plugin might mark. Pure string and attribute tests, no layout reads. */
export function eligible(code: Element) {
  if (code.hasAttribute(KIND) && !code.hasAttribute(MARK)) return false

  if (code.closest("a")) return false

  const text = code.textContent?.trim() ?? ""

  return text.length > 4 && text.length <= MAX_TEXT && /\s/.test(text) && claim(text)?.spaced === true
}

export function watchSpacedCode(doc: Document, checker: Checker): () => void {
  const queue = new Set<Element>()
  let frame = 0
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

  const check = (code: Element) => {
    if (!eligible(code)) return apply(code, false)

    const text = code.textContent!.trim()
    const known = checker.peek(text)

    // The host re-renders blocks and drops attributes it does not own; a known answer restores the mark in this frame.
    if (known !== undefined) return apply(code, true)

    void checker.target(text).then((target) => {
      if (stopped || !code.isConnected || code.textContent?.trim() !== text) return
      apply(code, target !== undefined)
    })
  }

  const flush = () => {
    frame = 0
    let spent = 0

    for (const code of queue) {
      queue.delete(code)
      check(code)

      if (++spent >= BUDGET) break
    }

    if (queue.size > 0) frame = requestAnimationFrame(flush)
  }

  // Inline code of a message only: `code` whose parent is not `pre`, inside the host's markdown container.
  const consider = (code: Element) => {
    if (code.parentElement?.localName === "pre" || !code.closest(MARKDOWN)) return

    queue.add(code)
  }

  // Tag lookups are live collections, far cheaper than a selector over every node a scroll mounts.
  const enqueue = (node: Node) => {
    if (!(node instanceof Element)) return

    if (node.localName === "code") return consider(node)

    const codes = node.getElementsByTagName("code")

    for (let index = 0; index < codes.length; index++) consider(codes[index]!)
  }

  const schedule = () => {
    if (!frame && queue.size > 0) frame = requestAnimationFrame(flush)
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        // Only the host removing the kind from a span we marked matters; our own writes leave it set.
        if (record.target instanceof Element && record.target.hasAttribute(MARK) && !record.target.hasAttribute(KIND)) queue.add(record.target)

        continue
      }

      // A code span whose text node was replaced (streaming, edits).
      if (record.target instanceof Element && record.target.localName === "code") consider(record.target)

      for (const node of record.addedNodes) enqueue(node)
    }

    schedule()
  })

  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: [KIND] })
  enqueue(doc.body)
  schedule()

  return () => {
    stopped = true
    observer.disconnect()

    if (frame) cancelAnimationFrame(frame)

    queue.clear()

    for (const code of doc.querySelectorAll(`[${MARK}]`)) apply(code, false)
  }
}
