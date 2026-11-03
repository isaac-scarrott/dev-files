import { createSignal, getOwner, onCleanup, type Accessor } from "solid-js"

// Display-only reading aid for the one-line preview of an injected row (a monitor's output line). The text the model gets and the
// card below the row keep the raw line; this only rewrites what the header shows: whole-token ISO-8601 timestamps become a clock
// time or a relative span, and a conservative set of snake_case statuses lose their underscore. Nothing inside backticks or in a
// token that holds a URL is touched.

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/
// Only statuses that contain an underscore: a plain word (`queued`, `failed`) already reads fine.
const STATUS: Readonly<Record<string, string>> = {
  in_progress: "in progress",
  timed_out: "timed out",
  action_required: "action required",
  startup_failure: "failed to start",
  not_started: "not started",
  changes_requested: "changes requested",
  review_required: "review required",
  in_queue: "in queue",
  partially_succeeded: "partially succeeded",
}
const LEAD = /^[(["'{<]+/
const TRAIL = /[)\]"'}>.,;:!?]+$/

const MINUTE = 60_000
const pad = (n: number) => String(n).padStart(2, "0")
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function day(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** The time of an ISO-8601 token (`Z`, an offset, or none meaning local time), or undefined when `token` is not one. */
export function parseIso(token: string): number | undefined {
  const m = ISO.exec(token)
  if (!m) return undefined
  const [, , month, dayOfMonth, hour, minute, second] = m
  if (+month! < 1 || +month! > 12 || +dayOfMonth! < 1 || +dayOfMonth! > 31 || +hour! > 23 || +minute! > 59 || +(second ?? 0) > 60) return undefined
  const ms = Date.parse(m[7] === undefined ? token : token.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * A moment as short text, relative to `now`: "just now" and "3m ago" within the hour, "in 5m" just ahead, then the clock time
 * for today ("20:24"), "yesterday 20:24", "Nov 2, 20:24", with the year when it is not this one.
 */
export function humanTime(ms: number, now: number): string {
  const delta = now - ms
  if (delta >= -MINUTE && delta < MINUTE) return "just now"
  if (delta >= MINUTE && delta < 60 * MINUTE) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < 0 && delta > -60 * MINUTE) return `in ${Math.ceil(-delta / MINUTE)}m`
  const at = new Date(ms)
  const current = new Date(now)
  const before = new Date(now)
  before.setDate(before.getDate() - 1)
  const that = day(at)
  if (that === day(current)) return clock(at)
  if (that === day(before)) return `yesterday ${clock(at)}`
  const year = at.getFullYear() === current.getFullYear() ? "" : ` ${at.getFullYear()}`
  return `${MONTHS[at.getMonth()]} ${at.getDate()}${year}, ${clock(at)}`
}

function token(raw: string, now: number): string {
  if (raw.includes("://")) return raw
  const lead = LEAD.exec(raw)?.[0] ?? ""
  const rest = raw.slice(lead.length)
  const trail = TRAIL.exec(rest)?.[0] ?? ""
  let core = rest.slice(0, rest.length - trail.length)
  // `status=in_progress`, `state:failed`: the value after one key and separator.
  const split = /^([A-Za-z][\w-]*[=:])(.+)$/.exec(core)
  const key = split ? split[1]! : ""
  if (key) core = split![2]!
  const ms = parseIso(core)
  const next = ms !== undefined ? humanTime(ms, now) : (STATUS[core.toLowerCase()] ?? core)
  return lead + key + next + trail
}

function rewrite(line: string, now: number): string {
  // Whitespace stays as written; a backtick toggles code, and tokens inside it are left alone.
  let code = false
  return line
    .split(/(\s+)/)
    .map((part, index) => {
      if (index % 2 === 1 || part === "") return part
      const ticks = (part.match(/`/g) ?? []).length
      const touched = !code && ticks === 0
      if (ticks % 2 === 1) code = !code
      return touched ? token(part, now) : part
    })
    .join("")
}

const cache = new Map<string, string>()
const CACHE_MAX = 400

/**
 * `line` as the row header shows it. Pure in (`line`, the minute of `now`); results are kept per line and minute, so a row that
 * redraws does no work. The raw line is the caller's to keep as the tooltip and in the card.
 */
export function humanizeLine(line: string, now: number = Date.now()): string {
  if (line === "" || (!line.includes("T") && !line.includes("_"))) return line
  const key = `${Math.floor(now / MINUTE)}\u0000${line}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const out = rewrite(line, now)
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(key, out)
  return out
}

/** A signal that holds the time and moves to the next minute; the timer lives with the calling owner. */
export function minuteClock(): Accessor<number> {
  const [now, set] = createSignal(Date.now())
  if (getOwner()) {
    const timer = setInterval(() => set(Date.now()), MINUTE)
    onCleanup(() => clearInterval(timer))
  }
  return now
}
