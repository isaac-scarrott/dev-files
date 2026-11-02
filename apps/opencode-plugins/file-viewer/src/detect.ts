import { extensionOf, isKnownDotfile, isKnownExtension, isKnownName, isTechName, kindOfPath, viewerInfo } from "./kinds"
import type { Candidate, Confidence, Origin, ParseOptions, Parsed, PathForm, RejectReason } from "./types"

const MAX_SPAN = 4096
const MAX_SEGMENT = 255
const MAX_LINE = 10_000_000

const rank: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

// Bidi overrides and zero-width characters can make `gpj.png` read as `png.jpg`, so they never appear in a candidate.
// U+200D (zero-width joiner) stays: emoji sequences need it.
const spoofing = /[‪-‮⁦-⁩​‌⁠﻿]/
const controls = /[\u0001-\u001F\u007F-\u009F]/

const isSpace = (char: string) => /\s/.test(char)

const topLevelDomains = new Set(
  "com org net io dev app ai co uk de fr eu us ca au in jp cn ru br info biz me tv xyz tech cloud edu gov gg ly sh".split(" "),
)

// Where an absolute path without an extension is likely a real file system path and not a URL route such as `/api/users`.
const systemRoots = new Set(
  "Users home tmp var etc opt usr private Volumes Applications Library mnt root srv Users System".split(" "),
)

// First words that make `word a.mp4` a shell command, not a file name with a space.
const commandVerbs = new Set(
  "open cat ls cd rm cp mv play ffplay ffmpeg vlc mpv code vim nvim vi nano less more head tail python python3 node bun npm pnpm yarn git curl wget bash sh zsh sudo convert magick qlmanage xdg-open start explorer view show see edit run exec echo touch mkdir tar unzip zip diff grep rg find".split(
    " ",
  ),
)

const wrappers: Record<string, string> = { '"': '"', "'": "'", "`": "`", "<": ">", "(": ")", "[": "]", "{": "}" }
const trailingPunctuation = new Set([".", ",", ";", ":", "!", "?", "…"])
const closers = new Set([")", "]", "}", ">", '"', "'", "`"])
const openerOf: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" }

function isBalanced(text: string, open: string, close: string) {
  let depth = 0

  for (let index = 0; index < text.length; index++) {
    if (text[index] === open) depth++
    else if (text[index] === close && --depth < 0) return false
  }

  return depth === 0
}

function count(text: string, char: string) {
  let total = 0
  for (let index = 0; index < text.length; index++) if (text[index] === char) total++
  return total
}

/** Removes wrapping quotes and brackets and trailing sentence punctuation. Returns the inner range. */
function unwrap(text: string, from: number, to: number) {
  let quoted = false

  for (let pass = 0; pass < 8; pass++) {
    while (from < to && isSpace(text[from]!)) from++
    while (to > from && isSpace(text[to - 1]!)) to--

    if (to - from >= 2) {
      const close = wrappers[text[from]!]

      if (close && text[to - 1] === close) {
        const inner = text.slice(from + 1, to - 1)

        // `(a)(b)` is not one wrapped path.
        if (!openerOf[close] || isBalanced(inner, text[from]!, close)) {
          if (text[from] === '"' || text[from] === "'" || text[from] === "`") quoted = true
          from++
          to--
          continue
        }
      }
    }

    const last = text[to - 1]

    if (last === undefined || to <= from) break

    if (trailingPunctuation.has(last) && to - from > 1) {
      to--
      continue
    }

    if (closers.has(last) && to - from > 1) {
      const slice = text.slice(from, to)
      const opener = openerOf[last]
      const unbalanced = opener ? count(slice, last) > count(slice, opener) : count(slice, last) % 2 === 1

      if (unbalanced) {
        to--
        continue
      }
    }

    // A leading quote or bracket that never closes.
    const first = text[from]!

    if (wrappers[first] && to - from > 1 && !text.slice(from + 1, to).includes(wrappers[first]!)) {
      from++
      continue
    }

    break
  }

  return { from, to, quoted }
}

function toSeconds(parts: readonly string[]) {
  const numbers = parts.map(Number)
  if (numbers.some((value) => !Number.isFinite(value))) return
  return numbers.reduce((total, value) => total * 60 + value, 0)
}

/** `72`, `72s`, `72.5`, `1:12`, `1:02:03`, `1m12s`, `1h2m3s`, `72,90` (start only). */
export function parseTime(text: string): number | undefined {
  const start = text.split(",")[0]!.trim()

  if (/^\d+(?:\.\d+)?s?$/.test(start)) return Number(start.replace(/s$/, ""))

  if (/^\d{1,3}(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(start)) return toSeconds(start.split(":"))

  const unit = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(start)

  if (unit && (unit[1] || unit[2] || unit[3])) return Number(unit[1] ?? 0) * 3600 + Number(unit[2] ?? 0) * 60 + Number(unit[3] ?? 0)
}

interface Suffix {
  body: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  time?: number
  page?: number
  anchor?: string
}

const validLine = (value: string | undefined) => {
  if (value === undefined) return
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 1 && number <= MAX_LINE ? number : undefined
}

const hasExtension = (text: string) => {
  const name = text.slice(Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\")) + 1)
  return extensionOf(name) !== "" || isKnownName(name) || isKnownDotfile(name)
}

const isMediaPath = (body: string) => {
  const kind = kindOfPath(body)?.kind
  return kind === "video" || kind === "audio"
}

/** Splits `#L10-L20`, `#t=72`, `#page=3`, `:12:3`, `:1:12` (media), `@1:12` (media) and `(12,3)` off the end. */
export function splitSuffix(text: string): Suffix {
  let body = text
  const result: Suffix = { body }

  const hash = body.lastIndexOf("#")

  if (hash > 0 && !/[\\/]/.test(body.slice(hash + 1)) && hasExtension(body.slice(0, hash))) {
    const fragment = body.slice(hash + 1)
    const lines = /^L(\d+)(?:C(\d+))?(?:-L?(\d+)(?:C(\d+))?)?$/i.exec(fragment)
    const time = /^t=(.+)$/.exec(fragment)
    const page = /(?:^|&)page=(\d+)/.exec(fragment)

    body = body.slice(0, hash)

    if (lines) {
      result.line = validLine(lines[1])
      result.column = validLine(lines[2])
      result.endLine = validLine(lines[3])
      result.endColumn = validLine(lines[4])
    } else if (time) result.time = parseTime(time[1]!)
    else if (page) result.page = validLine(page[1])
    else if (fragment) result.anchor = fragment
  }

  let timed = false
  const at = /@\s?(\d+(?:\.\d+)?s?|\d{1,3}(?::\d{1,2}){1,2}|(?:\d+h)?(?:\d+m)?(?:\d+s)?)$/.exec(body)

  if (at?.[1] && at.index > 0 && isMediaPath(body.slice(0, at.index).trimEnd())) {
    const time = parseTime(at[1])

    if (time !== undefined) {
      result.time = time
      body = body.slice(0, at.index).trimEnd()
      timed = true
    }
  }

  const clock = timed ? null : /:(\d{1,3}(?::\d{1,2}){0,2}(?:\.\d+)?)$/.exec(body)

  if (clock?.[1] && result.time === undefined && isMediaPath(body.slice(0, clock.index))) {
    const time = parseTime(clock[1])

    if (time !== undefined) {
      result.time = time
      body = body.slice(0, clock.index)
      timed = true
    }
  }

  if (!timed && result.time === undefined) {
    // TypeScript style `file.ts(12,3)`: only straight after a known extension, so `Photo (1).png` stays whole.
    const paren = /\((\d+)(?:,\s?(\d+))?\)$/.exec(body)

    if (paren && paren.index > 0 && isKnownExtension(extensionOf(body.slice(0, paren.index).split(/[\\/]/).pop()!))) {
      result.line ??= validLine(paren[1])
      result.column ??= validLine(paren[2])
      body = body.slice(0, paren.index)
    }

    const colon = /:(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/.exec(body)

    if (colon && colon.index > 0 && !/^[A-Za-z]$/.test(body.slice(0, colon.index))) {
      result.line ??= validLine(colon[1])
      result.column ??= validLine(colon[2])
      result.endLine ??= validLine(colon[3])
      result.endColumn ??= validLine(colon[4])
      body = body.slice(0, colon.index)
    }
  }

  // A reversed or incomplete range is a single position.
  if (result.endLine !== undefined && result.line !== undefined && result.endLine < result.line) {
    const swap = result.line
    result.line = result.endLine
    result.endLine = swap
  }

  result.body = body
  return result
}

const reject = (reason: RejectReason): Parsed => ({ ok: false, reason })

function decodeSegments(path: string): string | undefined {
  try {
    return decodeURIComponent(path)
  } catch {
    return undefined
  }
}

/** Leading `\` turns punctuation back into a plain character: `my\ file.png`, `a\(1\).png`. */
function unescapeShell(text: string) {
  return text.replace(/\\([ ()[\]{}&;'"!$#,])/g, "$1")
}

/**
 * Reads one piece of text (an inline code span or a link destination) as a file path. Returns the candidate or the
 * reason it is not one. Linear in the input length: no regex here backtracks.
 */
export function parseSpan(input: string, options: ParseOptions = {}): Parsed {
  const origin: Origin = options.origin ?? "code"
  const minimum = options.minConfidence ?? "low"

  if (input.length > MAX_SPAN) return reject("too-long")

  if (input.includes("\0")) return reject("null-byte")

  if (spoofing.test(input)) return reject("bidi-control")

  if (/[\r\n]/.test(input)) return reject("newline")

  if (controls.test(input)) return reject("control-char")

  const trimmed = unwrap(input, 0, input.length)
  const text = input.slice(trimmed.from, trimmed.to)

  if (!text) return reject("empty")

  if (text.startsWith("#") || text.startsWith("?")) return reject("fragment-only")

  const quoted = trimmed.quoted
  const start = trimmed.from
  const end = trimmed.to

  // URLs. A `file://` URL is the only scheme that names a local file.
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(text)

  if (scheme && scheme[1]!.toLowerCase() !== "file") return reject("url")

  if (/^[^\s/@:]+@[A-Za-z][^\s/@:]*:/.test(text)) return reject("scp-url")

  if (/^(?:mailto|tel|data|javascript|about|blob|urn|sms|magnet|git|ssh|http|https|ftp|ws|wss):/i.test(text)) return reject("scheme")

  if (/^[A-Za-z0-9.-]+:\d{1,5}\//.test(text)) return reject("host-port")

  const suffix = splitSuffix(text)
  let body = suffix.body

  if (!body) return reject("empty")

  let form: PathForm
  let envVar: string | undefined
  let path: string

  if (scheme) {
    if (body.includes("?")) body = body.slice(0, body.indexOf("?"))
    let rest = body.slice(7)

    if (/%(?:2f|5c|00)/i.test(rest)) return reject("encoded-separator")

    const decoded = decodeSegments(rest)

    if (decoded === undefined) return reject("bad-escape")

    if (controls.test(decoded) || decoded.includes("\0")) return reject("control-char")

    rest = decoded.replaceAll("\\", "/")

    if (/^localhost\//i.test(rest)) rest = rest.slice(9)

    if (rest.startsWith("/")) {
      const drive = /^\/([A-Za-z]:\/.*)$/.exec(rest)
      form = drive ? "windows" : "file-url"
      path = drive ? drive[1]! : rest
    } else {
      form = "unc"
      path = `//${rest}`
    }
  } else {
    // Windows drive, UNC, then the rest. Backslashes only become separators after this.
    if (/^[A-Za-z]:[\\/]/.test(body)) {
      form = "windows"
      path = body.replaceAll("\\", "/")
    } else if (/^[A-Za-z]:(?![\\/])/.test(body) && body.length > 2) {
      return reject("drive-relative")
    } else if (/^\\\\/.test(body)) {
      form = "unc"
      path = body.replaceAll("\\", "/")
    } else {
      if (origin === "href") {
        const decoded = decodeSegments(body)

        if (decoded === undefined) return reject("bad-escape")

        if (controls.test(decoded) || decoded.includes("\0")) return reject("control-char")

        body = decoded
      }

      body = unescapeShell(body).replaceAll("\\", "/")

      if (body.startsWith("//")) return reject("protocol-relative")

      const env = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?(?=\/|$)/.exec(body) ?? /^%([A-Za-z_][A-Za-z0-9_]*)%(?=\/|$)/.exec(body)
      const tilde = /^~([^/\s]*)(?:\/|$)/.exec(body)

      if (env) {
        form = "env"
        envVar = env[1]
      } else if (tilde) {
        if (tilde[1] === "") form = "tilde"
        else if (/^[A-Za-z_][\w.-]*$/.test(tilde[1]!)) form = "tilde-user"
        else return reject("tilde-special")
      } else if (body.startsWith("/")) form = "absolute"
      else if (/^\.\.?\//.test(body)) form = "relative-dot"
      else if (body.includes("/")) form = "relative"
      else form = "bare"

      path = body
    }
  }

  if (path === "/" || path === "." || path === ".." || path === "~") return reject(path === "/" ? "root-only" : "not-a-path")

  if (/[*?]/.test(path) || /\{[^{}]*,[^{}]*\}/.test(path)) return reject("glob")

  if (/[<>|"]/.test(path)) return reject("invalid-char")

  const dollar = form === "env" ? path.replace(/^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_][A-Za-z0-9_]*%)/, "") : path

  if (/\$[({A-Za-z_]/.test(dollar) || dollar.includes("`")) return reject("shell-substitution")

  if (path.endsWith("/")) return reject("directory")

  const segments = path.split("/")

  for (const segment of segments) {
    if (segment.length > MAX_SEGMENT) return reject("segment-too-long")

    const lower = segment.toLowerCase()

    if (/%(?:2f|5c|00)/.test(lower)) return reject(lower.includes("%00") ? "null-byte" : "encoded-separator")

    if (/^(?:%2e|\.){2}$/.test(lower) && lower !== "..") return reject("encoded-traversal")

    if (lower === "%2e") return reject("encoded-traversal")
  }

  if (/\s/.test(path)) {
    const words = path.split(/\s+/)
    const command =
      words.slice(1).some((word) => /^--?[A-Za-z]/.test(word) || /^(?:&&|\|\||;|>>?|<|2>&1)$/.test(word)) ||
      commandVerbs.has(words[0]!.toLowerCase())

    // The whole text is the path (code span, link destination), so a name with spaces is one path unless it reads like
    // a command.
    if (command || words.length > 12) return reject("not-a-path")
  }

  const name = segments.at(-1)!
  const ext = extensionOf(name)
  const shaped = /^[a-z][a-z0-9]{0,9}$/.test(ext)
  const known = shaped && isKnownExtension(ext)
  const named = isKnownName(name) || isKnownDotfile(name)
  const strong = form !== "bare" && form !== "relative"

  if (/^v?\d+(?:\.\d+)+$/i.test(name)) return reject("version")

  if (/^[\d./:,-]+$/.test(path.replace(/^~?\/?/, ""))) return reject("numeric")

  if (form === "relative") {
    const first = segments[0]!.toLowerCase()
    const labels = first.split(".")

    if (labels.length > 1 && /^[a-z0-9-]+$/.test(labels.join("")) && topLevelDomains.has(labels.at(-1)!)) return reject("domain")
  }

  let confidence: Confidence

  if (form === "bare") {
    if (named) confidence = "medium"
    else if (!ext) return reject("no-extension")
    else if (!shaped) return reject(/^\d/.test(ext) ? "version" : "unknown-extension")
    else if (!known) return reject("unknown-extension")
    else confidence = viewerInfo(ext) ? "high" : "medium"

    if (isTechName(name)) confidence = "low"
  } else if (named) confidence = "high"
  else if (known) confidence = "high"
  else if (shaped) confidence = strong ? "medium" : "low"
  else if (form === "absolute") confidence = systemRoots.has(segments[1] ?? "") ? "medium" : "low"
  else confidence = form === "relative-dot" ? "medium" : "low"

  if (/\s/.test(path) && rank[confidence] > rank.medium) confidence = "medium"

  if (rank[confidence] < rank[minimum]) return reject("low-confidence")

  const viewer = viewerInfo(ext)

  const candidate: Candidate = {
    start,
    end,
    raw: input.slice(trimmed.from, trimmed.to),
    path,
    form,
    ext,
    ...(viewer ? { viewerKind: viewer.kind } : {}),
    ...(suffix.line !== undefined ? { line: suffix.line } : {}),
    ...(suffix.column !== undefined ? { column: suffix.column } : {}),
    ...(suffix.endLine !== undefined ? { endLine: suffix.endLine } : {}),
    ...(suffix.endColumn !== undefined ? { endColumn: suffix.endColumn } : {}),
    ...(suffix.time !== undefined ? { time: suffix.time } : {}),
    ...(suffix.page !== undefined ? { page: suffix.page } : {}),
    ...(suffix.anchor !== undefined ? { anchor: suffix.anchor } : {}),
    quoted,
    confidence,
    ...(envVar ? { envVar } : {}),
  }

  return { ok: true, candidate }
}
