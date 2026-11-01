import { detectPaths, parseSpan } from "./detect"
import type { Candidate, Confidence } from "./types"

export type LocatedSource = "code" | "link" | "image" | "autolink" | "definition" | "html" | "prose"

export interface Located extends Candidate {
  readonly source: LocatedSource
}

export interface ScanOptions {
  readonly minConfidence?: Confidence
  /** Also scan the text outside code spans and links as free text. Off by default: only inline code and links count. */
  readonly prose?: boolean
}

const listMarker = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/
const fenceOpen = /^ {0,3}(`{3,}|~{3,})(.*)$/

const blank = (text: string) => text.replace(/[^\n]/g, " ")

/**
 * Blanks fenced code blocks (``` and ~~~) and indented code blocks with spaces, keeping every offset and newline, so a
 * path inside a code block is never linked. An unclosed fence runs to the end, as in CommonMark.
 */
export function maskCodeBlocks(markdown: string): string {
  const lines = markdown.split("\n")
  let out = ""
  let fence: { char: string; length: number } | undefined
  let previousBlank = true
  let previousIndented = false
  let inList = false

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    const terminator = index === lines.length - 1 ? "" : "\n"
    const isBlank = line.trim() === ""

    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`)

      if (close.test(line)) fence = undefined

      out += blank(raw) + terminator
      continue
    }

    const open = fenceOpen.exec(line)

    if (open && !(open[1]![0] === "`" && open[2]!.includes("`"))) {
      fence = { char: open[1]![0]!, length: open[1]!.length }
      out += blank(raw) + terminator
      previousBlank = false
      previousIndented = false
      continue
    }

    const indented = /^(?: {4}|\t)/.test(line) && !isBlank

    if (indented && !inList && (previousBlank || previousIndented)) {
      out += blank(raw) + terminator
      previousIndented = true
      previousBlank = false
      continue
    }

    if (listMarker.test(line)) inList = true
    else if (!isBlank && !/^\s/.test(line) && previousBlank) inList = false

    // A blank line inside an indented block keeps the block open if more indented lines follow.
    previousIndented = previousIndented && isBlank
    previousBlank = isBlank
    out += raw + terminator
  }

  return out
}

interface Run {
  readonly position: number
  readonly length: number
}

function backtickRuns(text: string): Run[] {
  const runs: Run[] = []

  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "`") continue

    // A backslash escapes a single backtick outside code, but runs inside code are measured as written.
    let end = index

    while (text[end] === "`") end++

    runs.push({ position: index, length: end - index })
    index = end - 1
  }

  return runs
}

const htmlTags = new Set(["img", "a", "video", "audio", "source", "embed", "track", "link", "object", "iframe"])

function attributes(tag: string) {
  const found: Array<{ value: string; offset: number }> = []
  const lower = tag.toLowerCase()

  for (const name of ["src", "href", "data"]) {
    let from = 0

    for (;;) {
      const at = lower.indexOf(name, from)

      if (at < 0) break

      from = at + name.length

      if (at > 0 && !/\s/.test(tag[at - 1]!)) continue

      let cursor = from

      while (/\s/.test(tag[cursor] ?? "")) cursor++

      if (tag[cursor] !== "=") continue

      cursor++

      while (/\s/.test(tag[cursor] ?? "")) cursor++

      const quote = tag[cursor]

      if (quote !== '"' && quote !== "'") continue

      const close = tag.indexOf(quote, cursor + 1)

      if (close < 0) continue

      found.push({ value: tag.slice(cursor + 1, close), offset: cursor + 1 })
    }
  }

  return found
}

/** Reads a link destination starting at `from` (just after `(`). Returns the destination range and where scanning resumes. */
function destination(text: string, from: number): { start: number; end: number; next: number; angle: boolean } | undefined {
  let cursor = from

  while (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n") cursor++

  if (text[cursor] === "<") {
    const stop = Math.min(text.length, cursor + 2048)

    for (let scan = cursor + 1; scan < stop; scan++) {
      if (text[scan] === "\n" || text[scan] === "<") return
      if (text[scan] === ">") return { start: cursor + 1, end: scan, next: scan + 1, angle: true }
    }

    return
  }

  const start = cursor
  let depth = 0
  const stop = Math.min(text.length, cursor + 4096)

  for (; cursor < stop; cursor++) {
    const char = text[cursor]!

    if (char === "\\" && cursor + 1 < stop) {
      cursor++
      continue
    }

    if (char === "(") depth++
    else if (char === ")") {
      if (depth === 0) break
      depth--
    } else if (char === " " || char === "\t" || char === "\n") break
  }

  if (cursor === start) return

  return { start, end: cursor, next: cursor, angle: false }
}

/**
 * Finds file paths in markdown source: inline code spans, link and image destinations, `file:` autolinks, reference
 * definitions and the `src`/`href` of raw HTML tags. Fenced and indented code blocks are never scanned. Ranges are offsets
 * into `markdown`.
 */
export function scanMarkdown(markdown: string, options: ScanOptions = {}): Located[] {
  const text = maskCodeBlocks(markdown)
  const minimum = options.minConfidence
  const found: Located[] = []
  const covered: Array<[number, number]> = []
  const runs = backtickRuns(text)
  const runAt = new Map(runs.map((run) => [run.position, run]))
  const byLength = new Map<number, Run[]>()
  const pointers = new Map<number, number>()

  for (const run of runs) {
    const list = byLength.get(run.length) ?? []
    list.push(run)
    byLength.set(run.length, list)
  }

  const opens: Array<{ position: number; image: boolean }> = []

  const add = (candidate: Candidate, source: LocatedSource) => found.push({ ...candidate, source })

  // The closer is the next run of the same length after the opener; openers only advance, so the pointer does too.
  const closerFor = (run: Run) => {
    const list = byLength.get(run.length) ?? []
    let pointer = pointers.get(run.length) ?? 0

    while (pointer < list.length && list[pointer]!.position <= run.position) pointer++

    pointers.set(run.length, pointer)

    return list[pointer]
  }

  // Definitions: `[id]: path "title"` at the start of a line.
  const definition = /^ {0,3}\[[^\]\n]{1,999}\]:[ \t]*(<[^>\n]*>|\S+)/gm
  let match: RegExpExecArray | null

  while ((match = definition.exec(text))) {
    const raw = match[1]!
    const angle = raw.startsWith("<")
    const value = angle ? raw.slice(1, -1) : raw
    const offset = match.index + match[0].length - raw.length + (angle ? 1 : 0)
    const parsed = parseSpan(value, { origin: "href", offset, minConfidence: minimum })

    if (parsed.ok) {
      add(parsed.candidate, "definition")
      covered.push([offset, offset + value.length])
    }
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!

    if (char === "\\") {
      index++
      continue
    }

    if (char === "`") {
      const run = runAt.get(index) ?? { position: index, length: 1 }
      const closer = closerFor(run)

      if (!closer) {
        index += run.length - 1
        continue
      }

      let from = run.position + run.length
      let to = closer.position
      const inner = text.slice(from, to)

      if (inner.length > 2 && inner.startsWith(" ") && inner.endsWith(" ") && inner.trim() !== "") {
        from++
        to--
      }

      const parsed = parseSpan(text.slice(from, to).replace(/\n/g, " "), { origin: "code", offset: from, minConfidence: minimum })

      if (parsed.ok) add(parsed.candidate, "code")

      covered.push([run.position, closer.position + closer.length])
      index = closer.position + closer.length - 1
      continue
    }

    if (char === "[") {
      if (opens.length < 64) opens.push({ position: index, image: text[index - 1] === "!" })
      continue
    }

    if (char === "]") {
      const open = opens.pop()

      if (open && text[index + 1] === "(") {
        const dest = destination(text, index + 2)

        if (dest) {
          const value = text.slice(dest.start, dest.end)
          const parsed = parseSpan(value, { origin: "href", offset: dest.start, minConfidence: minimum, quoted: dest.angle })

          if (parsed.ok) add(parsed.candidate, open.image ? "image" : "link")

          covered.push([dest.start, dest.end])
          index = dest.next - 1
        }
      }

      continue
    }

    if (char === "<") {
      if (text.startsWith("<file:", index)) {
        const close = text.indexOf(">", index)

        if (close > index && close - index < 4096 && !/[\s]/.test(text.slice(index, close))) {
          const parsed = parseSpan(text.slice(index + 1, close), { origin: "href", offset: index + 1, minConfidence: minimum })

          if (parsed.ok) add(parsed.candidate, "autolink")

          covered.push([index + 1, close])
          index = close
        }

        continue
      }

      const name = /^<([A-Za-z][A-Za-z0-9]*)/.exec(text.slice(index, index + 24))?.[1]?.toLowerCase()

      if (name && htmlTags.has(name)) {
        const close = text.indexOf(">", index)

        if (close > index && close - index < 8192) {
          const tag = text.slice(index, close)

          for (const attribute of attributes(tag)) {
            const parsed = parseSpan(attribute.value, { origin: "href", offset: index + attribute.offset, minConfidence: minimum, quoted: true })

            if (parsed.ok) add(parsed.candidate, "html")
          }

          covered.push([index, close])
          index = close
        }
      }
    }
  }

  if (options.prose) {
    let rest = ""
    let cursor = 0

    for (const [from, to] of covered.sort((a, b) => a[0] - b[0])) {
      if (from < cursor) continue

      rest += text.slice(cursor, from) + blank(text.slice(from, to))
      cursor = to
    }

    rest += text.slice(cursor)

    for (const candidate of detectPaths(rest, { origin: "prose", minConfidence: minimum })) add(candidate, "prose")
  }

  return found.sort((a, b) => a.start - b.start)
}
