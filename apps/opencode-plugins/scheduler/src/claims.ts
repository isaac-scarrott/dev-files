import { mkdir, open, readdir, stat, unlink } from "node:fs/promises"
import path from "node:path"

export type Claim = { readonly won: true } | { readonly won: false; /** How long ago the winner claimed it, ms. */ readonly ageMs: number }

/** Exactly-once gate: the first caller for a key wins, every later caller (any instance, any restart) loses. */
export interface Claims {
  claim(key: string): Promise<Claim>
}

const PRUNE_AFTER_MS = 30 * 24 * 3_600_000
const GLOBAL = Symbol.for("opencode-scheduler.claims")

/** Claims held by this process. Keyed on globalThis so a second copy of this module (one per project location, or a stale one after a reload) sees the same map. */
function processClaims(): Map<string, number> {
  const holder = globalThis as unknown as Record<symbol, Map<string, number> | undefined>
  return (holder[GLOBAL] ??= new Map())
}

/** In-memory claims, for tests and as the process-wide first gate. Pass one map to several schedulers to simulate shared instances. */
export function memoryClaims(now: () => number, held: Map<string, number> = new Map()): Claims {
  return {
    async claim(key) {
      const at = held.get(key)
      if (at !== undefined) return { won: false, ageMs: now() - at }
      held.set(key, now())
      return { won: true }
    },
  }
}

/**
 * Claims that survive restarts and span processes: the process-wide map first (a synchronous check-and-set), then an
 * `O_EXCL` file per key under `dir`, so only one creator wins even across processes. If the directory cannot be written
 * the process-wide claim still stands, which covers the instances that actually share a process.
 */
export function fileClaims(dir: string, now: () => number, log: (message: string) => void): Claims {
  const local = memoryClaims(now, processClaims())
  let prepared: Promise<void> | undefined
  const prepare = () =>
    (prepared ??= (async () => {
      await mkdir(dir, { recursive: true })
      const cutoff = now() - PRUNE_AFTER_MS
      for (const name of await readdir(dir)) {
        const file = path.join(dir, name)
        if ((await stat(file)).mtimeMs < cutoff) await unlink(file)
      }
    })().catch((error) => log(`claims: could not prepare ${dir}: ${String(error)}`)))
  return {
    async claim(key) {
      const mine = await local.claim(key)
      if (!mine.won) return mine
      await prepare()
      const file = path.join(dir, key.replace(/[^A-Za-z0-9_.@-]/g, "_"))
      try {
        await (await open(file, "wx")).close()
        return { won: true }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          const age = await stat(file).then((s) => Math.max(now() - s.mtimeMs, 0)).catch(() => 0)
          return { won: false, ageMs: age }
        }
        log(`claims: ${file}: ${String(error)}`)
        return { won: true }
      }
    },
  }
}
