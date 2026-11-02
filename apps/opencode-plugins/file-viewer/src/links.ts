import { claim, expand, type Where } from "./expand"

const HIT_MS = 60_000
const MISS_MS = 5_000
const MAX_ENTRIES = 512

/** What the link handler needs from the window. Kept small so it can be tested without one. */
export interface Deps {
  /** The routed session's file API and directory, or undefined when no session is shown (or the link is for another). */
  files(link: { session?: { key: string } }): { root: string; exists(path: string): Promise<boolean>; resolve(path: string): string; local: boolean } | undefined
  home(): Promise<string | undefined>
  /** Whether the host would link `href` on its own (its fuzzy workspace search). */
  hostExists(href: string): boolean | Promise<boolean>
  now(): number
}

interface Entry {
  readonly result: Promise<string | undefined>
  readonly expires: number
  known?: string | undefined
}

/**
 * The part of the plugin that decides what a link means. `target` is the exact absolute path of an existing file the plugin
 * can open, or undefined, in which case the host handles the link as it always did.
 */
export function createLinks(deps: Deps) {
  const entries = new Map<string, Entry>()

  const lookup = async (href: string, link: { session?: { key: string } }): Promise<string | undefined> => {
    const files = deps.files(link)
    const found = claim(href)

    if (!files || !found) return

    // `~` is this machine's home, so a remote server's files cannot be reached with it.
    const home = found.reason === "tilde" || found.candidate.form === "env" ? (files.local ? await deps.home() : undefined) : undefined
    const expanded = expand(found.candidate, { home, base: files.root } satisfies Where)

    if (!expanded.ok) return

    const path = files.resolve(expanded.absolute)

    return (await files.exists(path).catch(() => false)) ? expanded.href : undefined
  }

  return {
    /** Cheap and synchronous: whether this plugin wants the link. */
    match: (href: string) => claim(href) !== undefined,
    /** The href to hand the host for an existing file, cached like the host's own check. */
    target(href: string, link: { session?: { key: string } } = {}): Promise<string | undefined> {
      const files = deps.files(link)

      if (!files) return Promise.resolve(undefined)

      const key = `${files.root}\n${href}`
      const cached = entries.get(key)

      if (cached && cached.expires > deps.now()) return cached.result

      const result = lookup(href, link).catch(() => undefined)
      const entry: Entry = { result, expires: deps.now() + MISS_MS }
      entries.delete(key)
      entries.set(key, entry)

      void result.then((value) => {
        if (value === undefined || entries.get(key) !== entry) return
        entries.set(key, { result, expires: deps.now() + HIT_MS, known: value })
      })

      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)

      return result
    },
    /** The last known answer without waiting; undefined when unknown or expired. */
    peek(href: string, link: { session?: { key: string } } = {}): string | undefined {
      const files = deps.files(link)
      const cached = files ? entries.get(`${files.root}\n${href}`) : undefined

      return cached && cached.expires > deps.now() ? cached.known : undefined
    },
    clear: () => entries.clear(),
  }
}

export type Links = ReturnType<typeof createLinks>
