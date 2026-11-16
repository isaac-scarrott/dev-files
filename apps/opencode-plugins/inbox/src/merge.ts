// How two asks are the same ask. A call's `ref` names one thing across every session; without one, the question's text is
// the identity, but only within the family of the session that asked it: two projects asking "continue?" are not one ask.

/** Lowercase, punctuation removed, whitespace collapsed: what the text key is computed from. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** FNV-1a, 8 hex digits: a short, stable key for a normalised question, with no dependency. */
export function hash(text: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, "0")
}

export interface AskIdentity {
  /** `ref:<ref>` or `text:<hash of the normalised question>`. */
  readonly key: string
  /** `all`: a ref, whatever session asks; `root`: the question's text, only within the asker's root family. */
  readonly scope: "all" | "root"
  readonly ref?: string
}

export function askIdentity(input: { readonly question: string; readonly ref?: string }): AskIdentity {
  const ref = input.ref?.trim()
  if (ref) return { key: `ref:${ref}`, scope: "all", ref }
  return { key: `text:${hash(normalise(input.question))}`, scope: "root" }
}

/** Whether a stored ask is the same ask as this identity asked from `root`. */
export function sameAsk(stored: { readonly key: string; readonly root: string }, identity: AskIdentity, root: string): boolean {
  if (stored.key !== identity.key) return false
  return identity.scope === "all" || stored.root === root
}
