const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"' }

/**
 * Undoes one level of the escaping the server plugins put on text inside their wrapper tags (`& < > "`). One pass, so
 * `&amp;gt;` becomes `&gt;`: what the command really printed, not a guess at what it meant.
 */
export function unescapeMarkup(text: string): string {
  return text.replace(/&(amp|lt|gt|quot);/g, (_, name: string) => ENTITIES[name]!)
}

/** The first line with something on it, trimmed, for a one-line preview; empty when there is none. */
export function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ""
}

/** Whether `text` has anything beyond what `firstLine` shows. */
export function hasMore(text: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim() !== "")
  return lines.length > 1
}
