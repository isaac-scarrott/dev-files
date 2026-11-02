/** What a tick needs to know about its prompt and the reply that followed it. */
export type Prompt = {
  readonly id: string
  /** The prompt as one line of plain text. */
  readonly title: string
  /** The turn's final assistant text as plain text; absent when it has none. */
  readonly snippet?: string
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
export const TITLE_LIMIT = 200
/** Markdown is parsed from this many characters of the reply (t3-code: 1,500, "bound parsing work while long responses stream"). */
export const SNIPPET_SOURCE = 1500
/** t3-code's `maxUserTurns`: the prompts a thread holds when it first opens. */
export const INITIAL_PROMPTS = 10
/** t3-code's `OLDER_THREAD_USER_TURN_LIMIT`: the most a page of earlier history adds to the rail. */
export const PAGE_PROMPTS = 20
/** What a prompt without text is called. */
export const EMPTY_TITLE = "User message"

const collapse = (text: string) => text.replace(/\s+/g, " ").trim()

/** The prompt's one-line label: its display text, else its text, else "User message" (t3-code's wording). */
export function promptLabel(message: Message): string {
  const display = message.metadata?.displayText
  const text = collapse(typeof display === "string" && display ? display : (message.text ?? ""))

  if (!text) return EMPTY_TITLE

  return text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT)}…` : text
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

/** The metadata key orchestrator-tools sets on a message another session sent: such a message is not the user's prompt. */
export const PEER_KEY = "peerMessage"

const isPrompt = (message: Message) => message.type === "user" && message.metadata?.[PEER_KEY] === undefined

/** The user's own prompts the host lists, and only those before a pending revert. Peer messages are not prompts. */
export function loadedIds(messages: readonly Message[], revertMessageID?: string): string[] {
  const out: string[] = []

  for (const message of messages) {
    if (isPrompt(message) && !(revertMessageID && message.id >= revertMessageID)) out.push(message.id)
  }

  return out
}

/** A reply's text as the plain text a card shows: its text parts, the first `SNIPPET_SOURCE` characters, markdown stripped. */
function snippetOf(reply: Message): string | undefined {
  const text = (reply.content ?? []).flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n")

  return (text.trim() ? stripMarkdown(text.slice(0, SNIPPET_SOURCE)) : "") || undefined
}

/**
 * The prompts the rail shows, in order, from `since` on (the whole list when absent), each with the turn's final
 * assistant text: t3-code's `resolveFinalAssistantTextForTurn`, the last assistant message before the next prompt.
 */
export function prompts(messages: readonly Message[], revertMessageID?: string, since?: string): Prompt[] {
  const out: Prompt[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!

    if (!isPrompt(message) || (revertMessageID && message.id >= revertMessageID)) continue

    if (since && message.id < since) continue
    let last: Message | undefined

    for (let next = index + 1; next < messages.length && messages[next]!.type !== "user"; next += 1) {
      if (messages[next]!.type === "assistant") last = messages[next]
    }
    const reply = last
    let snippet: string | undefined | null = null

    out.push({
      id: message.id,
      title: promptLabel(message),
      // Read only when a card shows it: markdown stripping is the costly part of building a prompt.
      get snippet() {
        if (snippet === null) snippet = reply ? snippetOf(reply) : undefined

        return snippet
      },
    })
  }

  return out
}

/**
 * The prompts the rail covers, as t3-code's thread window: the newest `INITIAL_PROMPTS` when a thread first shows,
 * and, when the user has asked for earlier history and a page lands above the window, that page (at most
 * `PAGE_PROMPTS`) joins it. A page the host loads on its own, before the user touched the timeline, does not: the
 * host fetches a second page a moment after the first, and a rail that grew with it would load in before the user's
 * eyes. New prompts at the end join as they arrive. `from` is the window's oldest prompt; `loaded` is the host's list.
 */
export type PromptWindow = { readonly from: string; readonly loaded: readonly string[] }

export function promptWindow(previous: PromptWindow | undefined, loaded: readonly string[], asked = true): PromptWindow | undefined {
  if (loaded.length === 0) return undefined

  if (!previous) return { from: loaded[Math.max(0, loaded.length - INITIAL_PROMPTS)]!, loaded }
  const head = previous.loaded[0]
  const added = !asked || head === undefined ? 0 : loaded.indexOf(head)
  const kept = loaded.indexOf(previous.from)
  // A prompt that left the list (a revert) hands the window's edge to the next one still listed.
  const edge = kept !== -1 ? kept : loaded.findIndex((id) => id > previous.from)

  if (edge === -1) return { from: loaded[Math.max(0, loaded.length - INITIAL_PROMPTS)]!, loaded }

  return { from: loaded[Math.max(0, edge - (added > 0 ? Math.min(added, PAGE_PROMPTS) : 0))]!, loaded }
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
