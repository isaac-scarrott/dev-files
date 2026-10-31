import { lstat, realpath, rm, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { BASE_NAME, NAME, UUID } from "./scratch.js"

export const DAY = 24 * 60 * 60 * 1000
/** A scratch folder whose sessions are all archived goes once the newest archive is older than this. */
export const ARCHIVED_AFTER = 7 * DAY
/** A scratch folder no session was ever created in goes once it is older than this (an abandoned draft). */
export const ABANDONED_AFTER = DAY
const PAGE = 100
const MAX_PAGES = 500

type Page = { data: ReadonlyArray<Listed>; cursor: { next?: string | null } }
type Listed = { id: string; time: { archived?: number | undefined }; location: { directory: string } }
export type SessionLister = {
  session: { list(input: { archived?: boolean; limit?: number; cursor?: string; directory?: string }): Promise<Page> }
}

/** The server's data dir for opencode, resolved like the host does (`XDG_DATA_HOME`, else `~/.local/share`). */
export function scratchBase(env: NodeJS.ProcessEnv = process.env, home: () => string = homedir) {
  const xdg = env.XDG_DATA_HOME
  if (xdg && path.isAbsolute(xdg)) return path.join(xdg, "opencode", BASE_NAME)
  let h = ""
  try { h = home() } catch { /* no home */ }
  return h && path.isAbsolute(h) ? path.join(h, ".local", "share", "opencode", BASE_NAME) : undefined
}

/** `<base>/<uuid>/No project[/...]` -> uuid. Anything else, including `..` escapes, is not ours. */
export function scratchId(base: string, directory: string) {
  const rel = path.relative(base, path.resolve(directory))
  const [id, leaf] = rel.split(path.sep)
  if (!id || !UUID.test(id) || leaf !== NAME || rel.startsWith("..")) return undefined
  return id
}

async function pages(client: SessionLister, input: { archived: boolean; directory?: string }) {
  const out: Listed[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await client.session.list({ ...input, limit: PAGE, ...(cursor ? { cursor } : {}) })
    out.push(...page.data)
    const next = page.cursor.next
    if (!next) return out
    if (seen.has(next)) throw new Error("session list cursor repeated")
    seen.add(next)
    cursor = next
  }
  throw new Error("session list did not end")
}

/** Archived and live sessions. Any failure throws, so the caller deletes nothing. */
const listAll = async (client: SessionLister, directory?: string) => [
  ...(await pages(client, { archived: false, ...(directory ? { directory } : {}) })),
  ...(await pages(client, { archived: true, ...(directory ? { directory } : {}) })),
]

/** Removes `<base>/<id>` only if it is a real directory under the real base with a real `No project` child. */
async function remove(base: string, id: string) {
  const dir = path.join(base, id)
  const info = await lstat(dir).catch(() => undefined)
  if (!info?.isDirectory() || info.isSymbolicLink()) return false
  const child = await lstat(path.join(dir, NAME)).catch(() => undefined)
  if (!child?.isDirectory() || child.isSymbolicLink()) return false
  const [realBase, realDir] = await Promise.all([realpath(base), realpath(dir)])
  if (path.dirname(realDir) !== realBase) return false
  await rm(dir, { recursive: true, force: true })
  return true
}

export type Verdict = "keep" | "delete"

/** The rule for one folder, given its sessions (as listed) and the folder's age. */
export function decide(sessions: ReadonlyArray<Pick<Listed, "time">>, ageMs: number, now: number): Verdict {
  if (sessions.length === 0) return ageMs > ABANDONED_AFTER ? "delete" : "keep"
  let newest = 0
  for (const session of sessions) {
    if (session.time.archived === undefined) return "keep"
    newest = Math.max(newest, session.time.archived)
  }
  return now - newest > ARCHIVED_AFTER ? "delete" : "keep"
}

export type SweepOptions = { base: string; client: SessionLister; now?: number; log?: (line: string) => void }

// Concurrent sweeps share one run per base.
const running = new Map<string, Promise<string[]>>()

/** Sweeps the base dir. Returns the ids deleted. A listing failure rejects and deletes nothing. */
export function sweep(options: SweepOptions): Promise<string[]> {
  const existing = running.get(options.base)
  if (existing) return existing
  const run = sweepOnce(options).finally(() => running.delete(options.base))
  running.set(options.base, run)
  return run
}

async function sweepOnce({ base, client, now = Date.now(), log = () => {} }: SweepOptions) {
  const entries = await readdir(base, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const folders = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && UUID.test(entry.name))
  if (folders.length === 0) return []

  const sessions = await listAll(client)
  const byId = new Map<string, Listed[]>()
  for (const session of sessions) {
    const id = scratchId(base, session.location.directory)
    if (id) byId.set(id, [...(byId.get(id) ?? []), session])
  }

  const deleted: string[] = []
  for (const { name } of folders) {
    const info = await lstat(path.join(base, name)).catch(() => undefined)
    if (!info) continue
    if (decide(byId.get(name) ?? [], now - info.mtimeMs, now) !== "delete") continue
    if (await remove(base, name).catch((error) => (log(`no-project: could not delete ${name}: ${error}`), false))) {
      deleted.push(name)
      log(`no-project: deleted scratch folder ${name}`)
    }
  }
  return deleted
}

/** The folder of a session that was just deleted: removed at once when no other session still uses it. */
export async function removeIfUnused(options: { base: string; client: SessionLister; directory: string; log?: (line: string) => void }) {
  const id = scratchId(options.base, options.directory)
  if (!id) return false
  const left = await listAll(options.client, path.join(options.base, id, NAME))
  if (left.length > 0) return false
  const gone = await remove(options.base, id)
  if (gone) options.log?.(`no-project: deleted scratch folder ${id} (session deleted)`)
  return gone
}
