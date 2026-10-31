/** What a tick needs to know about its prompt and the reply that followed it. */
export type Prompt = {
  readonly id: string
  /** The prompt as one line of plain text. */
  readonly title: string
  /** The start of the reply as plain text; absent when nothing has been said. */
  readonly snippet?: string
  /** The reply is still streaming and has no text yet. */
  readonly working: boolean
  readonly length: "short" | "medium" | "long"
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

/** A rendered tick: the prompts it stands for, as a range of indexes into the prompt list. */
export type Tick = { readonly start: number; readonly end: number }

/** Tick pitch in px: the rail compresses towards MIN before it starts bucketing prompts. */
export const MIN_PITCH = 4
export const MAX_PITCH = 10
/** The rail never grows past this share of the timeline's visible height. */
export const RAIL_SHARE = 0.6
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

export function tickLength(text: string): Prompt["length"] {
  if (text.length < 40) return "short"

  return text.length < 160 ? "medium" : "long"
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
    out.push({ id: message.id, title, snippet, working: !snippet && working, length: tickLength(title) })
  }

  return out
}

/**
 * How the rail lays `count` prompts into `height` px: the pitch between ticks, and the ticks themselves, bucketed
 * once even the tightest pitch would overflow the rail's share of the height.
 */
export function layout(count: number, height: number): { pitch: number; ticks: Tick[] } {
  const room = Math.max(0, height * RAIL_SHARE)
  const capacity = Math.max(1, Math.floor(room / MIN_PITCH))

  if (count <= capacity) {
    const pitch = count > 0 ? Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.floor(room / count))) : MIN_PITCH

    return { pitch, ticks: Array.from({ length: count }, (_, index) => ({ start: index, end: index })) }
  }
  const ticks: Tick[] = []

  for (let bucket = 0; bucket < capacity; bucket += 1) {
    ticks.push({ start: Math.floor((bucket * count) / capacity), end: Math.floor(((bucket + 1) * count) / capacity) - 1 })
  }

  return { pitch: MIN_PITCH, ticks }
}

/** The tick that stands for prompt `index`, or -1. */
export function tickOf(ticks: readonly Tick[], index: number): number {
  return ticks.findIndex((tick) => index >= tick.start && index <= tick.end)
}
