import type { Row } from "./target"

/** What a tick needs to know about its prompt and the reply that followed it. */
export type Prompt = {
  readonly id: string
  /** The prompt as one line of plain text. */
  readonly title: string
  /** The start of the reply as plain text; absent when nothing has been said. */
  readonly snippet?: string
  /** The reply is still streaming and has no text yet. */
  readonly working: boolean
}

export type Message = {
  readonly id: string
  readonly type: string
  readonly text?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly files?: readonly { readonly mime: string; readonly name?: string }[]
  readonly agents?: readonly { readonly name: string }[]
  readonly content?: readonly { readonly type: string; readonly text?: string }[]
  readonly time?: { readonly completed?: number }
  readonly error?: unknown
}

/** Distance between ticks when the rail is not capped by the window, as t3-code's minimap. */
export const ITEM_SPACING = 8
/** Fewer prompts than this and the rail has nothing to say. */
export const MIN_ITEMS = 2
/** The rail never grows past the window height minus this (t3-code's `calc(100vh - 18rem)`), whatever else is on screen. */
export const MAX_HEIGHT_CSS = "calc(100vh - 18rem)"
/** Index distances beyond this from the pointer are drawn at rest. */
export const FISHEYE_REACH = 2
export const TITLE_LIMIT = 200
export const SNIPPET_LIMIT = 240

const collapse = (text: string) => text.replace(/\s+/g, " ").trim()

/** The prompt's one-line label: its display text, else what it attached. */
export function promptLabel(message: Message): string {
  const display = message.metadata?.displayText
  const text = collapse(typeof display === "string" && display ? display : (message.text ?? ""))

  if (text) return text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT)}…` : text
  const files = (message.files ?? []).map((file) => (file.mime.startsWith("image/") ? "[image]" : `[${file.name ?? "file"}]`))
  const agents = (message.agents ?? []).map((agent) => `@${agent.name}`)
  const parts = [...files, ...agents]

  return parts.length ? parts.slice(0, 3).join(" ") : "(empty prompt)"
}

/** Markdown to the plain text a snippet shows: fences, headings, emphasis, links, lists and tables fall away. */
export function stripMarkdown(text: string): string {
  return collapse(
    text
      .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>\n]+>/g, "")
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "")
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "")
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
      .replace(/(?<![\w*])(\*|_)(?=\S)([^*_\n]*?\S)\1(?![\w*])/g, "$2")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
      .replace(/`([^`\n]*)`/g, "$1")
      .replace(/^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "")
      .replace(/\|/g, " "),
  )
}

/**
 * The prompts the rail shows, in order, with the start of each reply. Candidates follow the host's
 * `visibleUserMessages`: user messages, and only those before a pending revert.
 */
export function prompts(messages: readonly Message[], revertMessageID?: string): Prompt[] {
  const out: Prompt[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!

    if (message.type !== "user" || (revertMessageID && message.id >= revertMessageID)) continue
    let snippet: string | undefined
    let working = false

    for (let next = index + 1; next < messages.length && messages[next]!.type !== "user"; next += 1) {
      const reply = messages[next]!

      if (reply.type !== "assistant") continue
      const text = reply.content?.find((part) => part.type === "text" && part.text && collapse(part.text))?.text

      if (text) {
        const plain = stripMarkdown(text)
        snippet = plain.length > SNIPPET_LIMIT ? `${plain.slice(0, SNIPPET_LIMIT)}…` : plain
        break
      }

      if (reply.time?.completed === undefined && !reply.error) working = true
    }
    const title = promptLabel(message)
    out.push({ id: message.id, title, snippet, working: !snippet && working })
  }

  return out
}

/** The rail strip's height: one `ITEM_SPACING` per gap, capped by the window, never negative. Ticks overlap beyond the cap. */
export function railHeightStyle(count: number): string {
  return `max(0px, min(${Math.max(1, (count - 1) * ITEM_SPACING)}px, ${MAX_HEIGHT_CSS}))`
}

/** Where prompt `index` sits along the strip, 0 to 100. */
export function topPercent(index: number, count: number): number {
  return count > 1 ? (index / (count - 1)) * 100 : 0
}

/**
 * The prompt a pointer is over: its position along the strip, mapped linearly to the nearest index. Every index is
 * reachable at any count, since the pointer picks an index, not a tick. null when there is nothing to pick.
 */
export function indexFromPointer(input: { count: number; top: number; height: number; y: number }): number | null {
  if (input.count < 1) return null

  if (input.count === 1 || input.height <= 0) return 0
  const progress = Math.min(1, Math.max(0, (input.y - input.top) / input.height))

  return Math.round(progress * (input.count - 1))
}

/** The ticks whose look depends on an active index: the active one and the neighbours the fisheye reaches. */
export function fisheyeBand(active: number | undefined, count: number): readonly [number, number] | undefined {
  if (active === undefined || active < 0 || active >= count) return undefined

  return [Math.max(0, active - FISHEYE_REACH), Math.min(count - 1, active + FISHEYE_REACH)]
}

/**
 * The prompts whose turns are on screen, as an inclusive index range. A row counts when it intersects `box`; its owner
 * is the prompt of its turn. Rows the host keeps mounted off screen (overscan, the last turn's final row) are ignored.
 */
export function visibleRange(
  indexOf: ReadonlyMap<string, number>,
  rows: readonly Row[],
  box: { readonly top: number; readonly bottom: number },
): readonly [number, number] | undefined {
  let first = Number.POSITIVE_INFINITY
  let last = -1

  for (const row of rows) {
    if (row.bottom <= box.top || row.top >= box.bottom) continue
    const index = indexOf.get(row.owner)

    if (index === undefined) continue
    first = Math.min(first, index)
    last = Math.max(last, index)
  }

  return last === -1 ? undefined : [first, last]
}
