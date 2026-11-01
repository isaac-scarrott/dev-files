import { unescapeMarkup } from "../../native-ui/src/injected-text.js"
import { TRAILER } from "./wrap.js"

export interface MonitorBlock {
  readonly kind: "event" | "notice"
  readonly seq: number
  readonly restart?: number
  /** Output lines (event) or plain sentences (notice), unescaped. */
  readonly lines: readonly string[]
}

export interface MonitorMessage {
  readonly name: string
  readonly id: string
  readonly blocks: readonly MonitorBlock[]
}

const OPEN = /^<(monitor-event|monitor-notice)((?:\s+[a-z]+="[^"]*")*)\s*>/
const ATTRIBUTE = /([a-z]+)="([^"]*)"/g

function attributes(source: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of source.matchAll(ATTRIBUTE)) found[match[1]!] = unescapeMarkup(match[2]!)
  return found
}

/**
 * The monitor wake behind a user message's text: one or more `<monitor-event>` / `<monitor-notice>` blocks, then the trailer.
 * Anything else (text before or between blocks, a different trailer, a block that never closes) returns undefined, so the
 * host renders the message as it is and no content is hidden. Event lines are escaped by the server, so a block ends at the
 * first closing tag.
 */
export function parseMonitorMessage(text: string): MonitorMessage | undefined {
  let rest = text.trimStart()
  const blocks: MonitorBlock[] = []
  let name: string | undefined
  let id: string | undefined
  for (;;) {
    const open = OPEN.exec(rest)
    if (!open) break
    const tag = open[1]!
    const close = rest.indexOf(`</${tag}>`, open[0].length)
    if (close < 0) return undefined
    const attrs = attributes(open[2]!)
    const seq = Number(attrs.seq)
    if (attrs.name === undefined || attrs.id === undefined || !Number.isInteger(seq)) return undefined
    if (name === undefined) {
      name = attrs.name
      id = attrs.id
    } else if (attrs.id !== id) return undefined
    const body = rest.slice(open[0].length, close).replace(/^\n/, "").replace(/\n$/, "")
    const restart = attrs.restart === undefined ? undefined : Number(attrs.restart)
    blocks.push({
      kind: tag === "monitor-event" ? "event" : "notice",
      seq,
      ...(restart !== undefined && Number.isInteger(restart) ? { restart } : {}),
      lines: unescapeMarkup(body).split("\n"),
    })
    rest = rest.slice(close + tag.length + 3).trimStart()
  }
  if (blocks.length === 0 || name === undefined || id === undefined) return undefined
  if (rest !== "" && rest !== TRAILER) return undefined
  return { name, id, blocks }
}

/** What the row's header says after the monitor's name. */
export function summarize(message: MonitorMessage): string {
  const first = message.blocks[0]!
  if (first.kind === "event") {
    const lines = message.blocks.filter((block) => block.kind === "event").flatMap((block) => block.lines).filter((line) => line.trim() !== "")
    const head = lines[0]?.trim() ?? ""
    return lines.length > 1 ? `${head} · ${lines.length} lines` : head
  }
  const note = first.lines[0] ?? ""
  if (/^This monitor was restarted/.test(note)) return first.restart === undefined ? "restarted" : `restarted (restart ${first.restart})`
  if (/^Monitor gone/.test(note)) return "lost"
  if (/^Monitor ended/.test(note)) return "ended"
  if (/^Paused/.test(note)) return "paused"
  if (/^Resumed/.test(note)) return "resumed"
  if (/^The command (exited|was killed)/.test(note)) return "command exited"
  return note.split(/(?<=[.!?])\s/)[0]!.trim()
}

export type MonitorWake = MonitorMessage & { readonly monitorID: string }

/**
 * The monitor wake a user message is, or undefined for anything else. The server stamps `metadata.monitor` on the prompts it
 * sends, so a message a user typed with the same tags stays the user's bubble; the text is only read after that check.
 */
export function monitorOf(message: { readonly type?: string; readonly text?: unknown; readonly metadata?: Readonly<Record<string, unknown>> }): MonitorWake | undefined {
  if (message.type !== "user" || typeof message.text !== "string") return undefined
  const stamp = message.metadata?.monitor
  if (!stamp || typeof stamp !== "object") return undefined
  const { monitorID, seq } = stamp as Record<string, unknown>
  if (typeof monitorID !== "string" || typeof seq !== "number") return undefined
  const parsed = parseMonitorMessage(message.text)
  if (!parsed || parsed.id !== monitorID) return undefined
  return { ...parsed, monitorID }
}
