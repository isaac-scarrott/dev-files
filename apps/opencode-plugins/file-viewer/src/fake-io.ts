import type { FileIO, Stat } from "./resolve"

type Entry = { type: "file"; size: number } | { type: "directory" } | { type: "link"; target: string } | { type: "denied" } | { type: "other" }

/**
 * An in-memory file system for tests. `unicode: "insensitive"` makes lookups ignore NFC/NFD like APFS, and
 * `caseInsensitive` makes them ignore case. Stored names keep how they were written; `real` returns the stored name.
 */
export function fakeIO(
  tree: Record<string, Entry | number | null>,
  options: { caseInsensitive?: boolean; unicode?: "insensitive" | "sensitive" } = {},
) {
  const fold = (path: string) => {
    const normal = options.unicode === "insensitive" ? path.normalize("NFC") : path
    return options.caseInsensitive ? normal.toLowerCase() : normal
  }

  const entries = new Map<string, { stored: string; entry: Entry }>()

  for (const [path, value] of Object.entries(tree)) {
    const entry: Entry = typeof value === "number" ? { type: "file", size: value } : value === null ? { type: "directory" } : value
    entries.set(fold(path), { stored: path, entry })
  }

  const calls: string[] = []

  const io: FileIO = {
    async stat(absolute): Promise<Stat> {
      calls.push(absolute)
      let current = absolute

      for (let hops = 0; hops < 16; hops++) {
        // A symlink anywhere along the path (a directory or the file itself) redirects the rest of it.
        const parts = current.split("/")
        let redirected = false

        for (let length = 1; length <= parts.length; length++) {
          const prefix = parts.slice(0, length).join("/")
          const found = entries.get(fold(prefix))

          if (found?.entry.type === "link") {
            current = [found.entry.target, ...parts.slice(length)].join("/")
            redirected = true
            break
          }
        }

        if (redirected) continue

        const found = entries.get(fold(current))

        if (!found) return { type: "missing" }

        const { entry, stored } = found

        if (entry.type === "file") return { type: "file", real: stored, size: entry.size }

        if (entry.type === "denied") return { type: "denied" }

        if (entry.type === "link") return { type: "missing" }

        return { type: entry.type, real: stored }
      }

      return { type: "missing" }
    },
  }

  return Object.assign(io, { calls })
}
