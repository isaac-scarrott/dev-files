import type { ViewerKind } from "./kinds"

/** Where a piece of text came from; it decides how strictly it is read. */
export type Origin =
  /** The whole text of an inline code span. */
  | "code"
  /** A link destination exactly as written in markdown (percent-escapes still encoded). */
  | "href"
  /** A link destination the host already decoded (the `Link.href` a `LinkHandler` receives). */
  | "decoded-href"
  /** Free text; tokens are found inside it. */
  | "prose"

export type PathForm =
  | "tilde"
  | "tilde-user"
  | "env"
  | "absolute"
  | "relative-dot"
  | "relative"
  | "bare"
  | "windows"
  | "unc"
  | "file-url"

export type Confidence = "high" | "medium" | "low"

export interface Candidate {
  /** Range of the matched path including any line or time suffix, wrapping quotes excluded. */
  readonly start: number
  readonly end: number
  readonly raw: string
  /** The path alone: unescaped, `file://` decoded, backslashes turned into `/`, diff prefix removed. No suffix. */
  readonly path: string
  readonly form: PathForm
  /** Lowercase extension of the last segment, "" for none. */
  readonly ext: string
  readonly viewerKind?: ViewerKind
  readonly line?: number
  readonly column?: number
  readonly endLine?: number
  readonly endColumn?: number
  /** Media start offset in seconds. */
  readonly time?: number
  /** PDF page from `#page=N`. */
  readonly page?: number
  /** Markdown or HTML anchor after `#`, when it is not a line range, time or page. */
  readonly anchor?: string
  readonly quoted: boolean
  readonly confidence: Confidence
  /** Other readings of the same text to try if `path` does not exist (names with spaces, diff `a/` prefix). */
  readonly alternatives: readonly string[]
  /** The environment variable a `form: "env"` path starts with. */
  readonly envVar?: string
}

export type RejectReason =
  | "empty"
  | "too-long"
  | "null-byte"
  | "control-char"
  | "bidi-control"
  | "newline"
  | "url"
  | "scp-url"
  | "host-port"
  | "domain"
  | "scheme"
  | "glob"
  | "invalid-char"
  | "shell-substitution"
  | "bad-escape"
  | "encoded-traversal"
  | "encoded-separator"
  | "segment-too-long"
  | "numeric"
  | "version"
  | "no-extension"
  | "unknown-extension"
  | "directory"
  | "root-only"
  | "protocol-relative"
  | "drive-relative"
  | "tilde-special"
  | "fragment-only"
  | "not-a-path"
  | "low-confidence"

export type Parsed = { readonly ok: true; readonly candidate: Candidate } | { readonly ok: false; readonly reason: RejectReason }

export interface ParseOptions {
  readonly origin?: Origin
  /** Offset added to start and end, for tokens found inside a larger text. */
  readonly offset?: number
  /** Lowest confidence returned. Spans default to "low" (an existence check follows), prose to "medium". */
  readonly minConfidence?: Confidence
  /** The text came from inside quotes, backticks or a `<...>` destination, so spaces are part of the name. */
  readonly quoted?: boolean
}

export interface DetectOptions {
  readonly origin?: Origin
  readonly minConfidence?: Confidence
  /** Stop after this many candidates (default 500). */
  readonly maxCandidates?: number
}
