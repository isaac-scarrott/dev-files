import { parseSpan } from "./detect"
import { isKnownExtension } from "./kinds"
import { isAbsolute, join, normalizeAbsolute } from "./policy"
import type { Candidate } from "./types"

/** Why the plugin takes a link: the host refuses `~` paths, and its inline code check rejects names with spaces. */
export type Reason = "tilde" | "spaced"

export interface Claim {
  readonly candidate: Candidate
  readonly reason: Reason
  /** The text contains whitespace, so the host never offered it to a handler as inline code. */
  readonly spaced: boolean
}

/**
 * Decides whether the plugin should handle `href` (the text of an inline code span or the decoded destination of a link).
 * Returns undefined for everything the host already handles, so the host's own behaviour stays untouched.
 */
export function claim(href: string): Claim | undefined {
  if (href.length > 1024) return

  const first = href[0]
  const leads = first === "~" || first === "$"

  // Cheap test first: this runs for every candidate the host checks.
  if (!leads && !/\s/.test(href)) return

  const parsed = parseSpan(href, { origin: "decoded-href", minConfidence: "low" })

  if (!parsed.ok) return

  const { candidate } = parsed
  const spaced = /\s/.test(candidate.path)
  const tilde = candidate.form === "tilde" || (candidate.form === "env" && (candidate.envVar === "HOME" || candidate.envVar === "USERPROFILE"))

  if (tilde) return candidate.confidence === "low" ? undefined : { candidate, reason: "tilde", spaced }

  if (!spaced || !isKnownExtension(candidate.ext)) return

  if (candidate.form === "windows" || candidate.form === "unc" || candidate.form === "tilde-user" || candidate.form === "env") return

  return { candidate, reason: "spaced", spaced }
}

export interface Where {
  /** The home directory of the machine the files are on. */
  readonly home?: string
  /** The session's directory; relative paths resolve against it. */
  readonly base: string
}

export type Expanded = { readonly ok: true; readonly absolute: string; readonly href: string } | { readonly ok: false; readonly reason: "no-home" }

/** The selection suffix the host understands (`#L10-L20`), rebuilt from the parsed candidate. */
function selection(candidate: Candidate) {
  if (candidate.line === undefined) return ""

  return `#L${candidate.line}${candidate.endLine !== undefined && candidate.endLine !== candidate.line ? `-L${candidate.endLine}` : ""}`
}

/** An absolute, normalised path (symlinks are left to the host), and the href to give the host for it. */
export function expand(candidate: Candidate, where: Where): Expanded {
  const path = candidate.path
  let absolute: string

  if (candidate.form === "tilde" || candidate.form === "env") {
    if (!where.home) return { ok: false, reason: "no-home" }

    absolute = join(where.home, path.replace(/^(?:~|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_][A-Za-z0-9_]*%)/, ""))
  } else if (isAbsolute(path)) absolute = normalizeAbsolute(path)
  else absolute = join(where.base, path)

  return { ok: true, absolute, href: absolute + selection(candidate) }
}
