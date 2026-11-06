import { execFile } from "node:child_process"
import { appendFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// A cold session re-sends its whole context uncached when woken: Anthropic's prompt cache lasts an hour at most.
const COLD_MS = 60 * 60_000
const WINDOW_MS = 60_000
const HISTORY_MS = 14 * 24 * 60 * 60_000
const RELEARN_MS = 60 * 60_000
const DEFAULTS = { floor: 8, multiplier: 2 }

const dataDir = (env, home) => path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "opencode")
const offFile = (env, home) => path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "opencode", "surge-guard.off")

// Only the GUI composer stamps displayText, so it is the one reliable sign a person typed the message.
export const isTyped = (metadata) => typeof metadata?.displayText === "string"

// Per minute over the last 14 days: how many cold sessions were woken by something other than typing.
// Same definition the guard applies live, so the limit and the check agree.
export const HISTORY_SQL = (now) => `
with u as (
  select session_id, time_created t, json_extract(data,'$.metadata.displayText') is not null typed,
         lag(time_created) over (partition by session_id order by time_created) prev
  from session_message where time_created > ${now - HISTORY_MS - COLD_MS}),
w as (select t/60000 minute, count(distinct session_id) n from u
      where t > ${now - HISTORY_MS} and not typed and (prev is null or t - prev > ${COLD_MS}) group by minute)
select n from w order by n;`

export function limitFrom(counts, { floor, multiplier } = DEFAULTS) {
  if (!counts.length) return floor
  const p99 = counts[Math.min(counts.length - 1, Math.floor(counts.length * 0.99))]
  return Math.max(floor, multiplier * p99)
}

function query(db, sql) {
  return new Promise((resolve, reject) =>
    execFile("sqlite3", ["-readonly", db, sql], { timeout: 20_000, maxBuffer: 1 << 22 }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    ),
  )
}

// Last message time per session, so sessions active before a restart don't all look cold.
const RECENT_SQL = (now) =>
  `select session_id, max(time_created) from session_message where time_created > ${now - COLD_MS} group by session_id;`

export function createGuard({ limit, now = Date.now } = {}) {
  const lastActive = new Map()
  const woken = new Map() // sessionID → when a non-typed message woke it from cold, within the window
  const state = { limit: limit ?? DEFAULTS.floor }
  return {
    state,
    seen(sessionID, at = now()) {
      lastActive.set(sessionID, at)
    },
    // Returns undefined to admit, or the refusal reason.
    check(sessionID, metadata) {
      const at = now()
      const last = lastActive.get(sessionID)
      lastActive.set(sessionID, at)
      if (isTyped(metadata)) return undefined
      if (last !== undefined && at - last <= COLD_MS) return undefined
      for (const [id, time] of woken) if (at - time > WINDOW_MS) woken.delete(id)
      if (woken.size >= state.limit) {
        lastActive.set(sessionID, last) // refused, so it stays cold
        return { count: woken.size, limit: state.limit }
      }
      woken.set(sessionID, at)
      return undefined
    },
  }
}

export const refusal = ({ count, limit }) =>
  `surge-guard refused this message: ${count} idle sessions were already woken in the last 60 s (limit ${limit}, ` +
  `learned from your last 14 days). Each one re-sends its whole context uncached, so a fan-out like this can empty ` +
  `a 5-hour usage window in about a minute. The message was not delivered. Message fewer sessions, or read their ` +
  `transcripts instead.`

export default {
  id: "surge-guard",
  async setup(ctx) {
    const options = ctx.options ?? {}
    const home = homedir()
    const env = process.env
    const db = path.join(dataDir(env, home), "opencode.db")
    const log = path.join(dataDir(env, home), "surge-guard", "refused.jsonl")
    const off = offFile(env, home)
    const config = { floor: options.floor ?? DEFAULTS.floor, multiplier: options.multiplier ?? DEFAULTS.multiplier }
    const guard = createGuard({ limit: options.limit })

    const learn = async () => {
      if (options.limit) return
      try {
        const out = await query(db, HISTORY_SQL(Date.now()))
        guard.state.limit = limitFrom(out.split("\n").filter(Boolean).map(Number), config)
      } catch (error) {
        console.warn(`surge-guard: kept limit ${guard.state.limit}; history query failed: ${error.message}`)
      }
    }
    try {
      const out = await query(db, RECENT_SQL(Date.now()))
      for (const line of out.split("\n").filter(Boolean)) {
        const [id, at] = line.split("|")
        guard.seen(id, Number(at))
      }
    } catch (error) {
      console.warn(`surge-guard: could not prime recent activity: ${error.message}`)
    }
    await learn()
    const timer = setInterval(learn, RELEARN_MS)
    timer.unref?.()

    await ctx.session.hook("context", (event) => guard.seen(event.sessionID))
    await ctx.session.hook("prompt", (event) => {
      let refused
      try {
        if (existsSync(off)) return
        refused = guard.check(event.sessionID, event.metadata)
      } catch (error) {
        console.warn(`surge-guard: admitted after an internal error: ${error.message}`)
        return
      }
      if (!refused) return
      mkdir(path.dirname(log), { recursive: true })
        .then(() => appendFile(log, JSON.stringify({ at: new Date().toISOString(), sessionID: event.sessionID, ...refused, metadata: Object.keys(event.metadata ?? {}) }) + "\n"))
        .catch(() => {})
      throw new Error(refusal(refused))
    })
  },
}
