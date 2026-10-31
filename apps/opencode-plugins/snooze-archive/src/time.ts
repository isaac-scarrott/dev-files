// Pure time logic for the snooze picker. Everything is relative to the device's current time zone, read from Date,
// so tests switch zones with process.env.TZ. Deadlines are absolute instants; only wall-clock choices go through
// resolveLocal.
export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000
export const MAX_HORIZON = 366 * DAY

export interface Fields { y: number; mo: number; d: number; h: number; mi: number }
const fieldsOf = (t: number): Fields => {
  const date = new Date(t)
  return { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), h: date.getHours(), mi: date.getMinutes() }
}
const same = (a: Fields, b: Fields) => a.y === b.y && a.mo === b.mo && a.d === b.d && a.h === b.h && a.mi === b.mi
// Month/day/hour overflow rolls over (day 32 is the 1st of the next month), independent of the time zone.
const normalize = (f: Fields): Fields => {
  const date = new Date(Date.UTC(f.y, f.mo, f.d, f.h, f.mi))
  return { y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: date.getUTCDate(), h: date.getUTCHours(), mi: date.getUTCMinutes() }
}

export interface Resolved {
  at: number
  // gap: the wall time does not exist (clocks jumped forward) and was moved ahead by the jump, as Temporal's default does.
  // overlap: the wall time happens twice (clocks went back); the first occurrence is used.
  resolution: "exact" | "gap" | "overlap"
  requested: Fields
  actual: Fields
}

export function resolveLocal(f: Fields): Resolved {
  const requested = normalize(f)
  const candidate = new Date(requested.y, requested.mo, requested.d, requested.h, requested.mi).getTime()
  const actual = fieldsOf(candidate)
  if (!same(actual, requested)) return { at: candidate, resolution: "gap", requested, actual }
  // Offsets change by at most a few hours; any other instant that shows the same wall time makes it ambiguous.
  let first = candidate
  for (let delta = -180; delta <= 180; delta += 15) {
    const other = candidate + delta * MINUTE
    if (other < first && same(fieldsOf(other), requested)) first = other
  }
  return { at: first, resolution: first === candidate && !hasTwin(candidate, requested) ? "exact" : "overlap", requested, actual }
}
const hasTwin = (candidate: number, requested: Fields) => {
  for (let delta = -180; delta <= 180; delta += 15) if (delta !== 0 && same(fieldsOf(candidate + delta * MINUTE), requested)) return true
  return false
}

export type PresetId = "1h" | "3h" | "evening" | "tomorrow" | "week"
export interface Preset { id: PresetId; label: string; until: number }

export function presets(now: Date): Preset[] {
  const base = fieldsOf(+now)
  const wall = (days: number, h: number) => resolveLocal({ ...base, d: base.d + days, h, mi: 0 }).at
  const evening = wall(0, 18)
  // Next Monday; on a Monday that is a week away.
  const toMonday = (8 - now.getDay()) % 7 || 7
  return [
    { id: "1h", label: "In 1 hour", until: +now + HOUR },
    { id: "3h", label: "In 3 hours", until: +now + 3 * HOUR },
    ...(evening > +now ? [{ id: "evening" as const, label: "This evening", until: evening }] : []),
    { id: "tomorrow", label: "Tomorrow", until: wall(1, 9) },
    { id: "week", label: "Next week", until: wall(toMonday, 9) },
  ]
}

export type Check = { ok: true } | { ok: false; reason: string }
export function checkWake(until: number, now: number): Check {
  if (!Number.isFinite(until)) return { ok: false, reason: "Enter a valid time." }
  if (until <= now) return { ok: false, reason: "That time has already passed. Choose a future time." }
  if (until - now > MAX_HORIZON) return { ok: false, reason: "Choose a time within the next year." }
  return { ok: true }
}

const UNITS: Record<string, number> = { m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE, h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR, d: DAY, day: DAY, days: DAY, w: 7 * DAY, wk: 7 * DAY, wks: 7 * DAY, week: 7 * DAY, weeks: 7 * DAY }
const SMALLER: Record<number, number> = { [HOUR]: MINUTE, [DAY]: HOUR, [7 * DAY]: DAY }

// "90m", "1h30", "1h 30m", "2 days", "1.5h", "45" (minutes). A bare number after a unit counts in the next smaller unit.
export function parseDuration(text: string): { ms: number } | { error: string } {
  const input = text.trim().toLowerCase().replace(/^in\s+/, "").replace(/,/g, ".").replace(/\band\b/g, " ")
  if (!input) return { error: "Enter a duration such as 30m, 2h or 1d." }
  const token = /\s*(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)/y
  let total = 0, last: number | undefined, index = 0, seen = new Set<number>()
  while (index < input.length) {
    token.lastIndex = index
    const match = token.exec(input)
    if (!match) return { error: "Use a number and unit, such as 90m, 1h30, 2 days or 1.5h." }
    index = token.lastIndex
    const value = Number(match[1])
    let unit: number | undefined
    if (match[2]) {
      unit = UNITS[match[2]]
      if (!unit) return { error: `Unknown unit “${match[2]}”. Use m, h, d or w.` }
    } else unit = last === undefined ? MINUTE : SMALLER[last]
    if (!unit) return { error: "Add a unit, such as m, h or d." }
    if (seen.has(unit)) return { error: "Each unit can appear once." }
    seen.add(unit)
    if (value % 1 !== 0 && index < input.length) return { error: "Only the last part can have decimals." }
    total += value * unit
    last = unit
  }
  const ms = Math.round(total / MINUTE) * MINUTE
  if (ms <= 0) return { error: "Choose a duration longer than zero." }
  return { ms }
}

export interface Format { locale?: string; hour12?: boolean }
const time = (t: number, o: Format) => new Intl.DateTimeFormat(o.locale, { hour: "numeric", minute: "2-digit", ...(o.hour12 === undefined ? {} : { hour12: o.hour12 }) }).format(t)

// The right-hand hint on a preset: just the time today (and for Tomorrow), otherwise with the weekday.
export function formatHint(preset: Preset, now: number, o: Format = {}): string {
  const days = Math.round((Date.UTC(...ymd(preset.until)) - Date.UTC(...ymd(now))) / DAY)
  if (days === 0 || preset.id === "tomorrow") return time(preset.until, o)
  const weekday = new Intl.DateTimeFormat(o.locale, { weekday: "short" }).format(preset.until)
  return `${weekday} ${time(preset.until, o)}`
}
const ymd = (t: number): [number, number, number] => { const f = fieldsOf(t); return [f.y, f.mo, f.d] }

// "Tue, 4 Nov, 14:05" in the user's locale, with the year only when it differs.
export function formatWake(t: number, now: number, o: Format = {}): string {
  const year = new Date(t).getFullYear() !== new Date(now).getFullYear()
  return new Intl.DateTimeFormat(o.locale, { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), hour: "numeric", minute: "2-digit", ...(o.hour12 === undefined ? {} : { hour12: o.hour12 }) }).format(t)
}

export const uses12Hour = (locale?: string) => {
  const cycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle
  return cycle === "h11" || cycle === "h12"
}

// "GMT+1 · Europe/London", for the offset in force at the instant.
export function zoneLabel(at: number, locale?: string): string {
  const offset = new Intl.DateTimeFormat(locale, { timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? ""
  return `${offset === "GMT+0" ? "GMT" : offset} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
}

// 0 = Sunday … 6 = Saturday. Intl.Locale weekInfo is 1 = Monday … 7 = Sunday; older engines fall back to the region.
export function firstDayOfWeek(locale?: string): number {
  const l = new Intl.Locale(locale ?? Intl.DateTimeFormat().resolvedOptions().locale) as Intl.Locale & { getWeekInfo?(): { firstDay: number }; weekInfo?: { firstDay: number } }
  const info = l.getWeekInfo?.() ?? l.weekInfo
  if (info) return info.firstDay % 7
  return ["US", "CA", "JP", "BR", "IL", "IN", "MX", "ZA", "KR", "TW", "PH", "AU"].includes(l.maximize().region ?? "") ? 0 : 1
}

export interface Day { y: number; mo: number; d: number; inMonth: boolean }
export function monthGrid(year: number, month: number, first: number): Day[][] {
  const lead = (new Date(year, month, 1).getDay() - first + 7) % 7
  const length = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((lead + length) / 7)
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const date = new Date(year, month, 1 - lead + w * 7 + i)
    return { y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), inMonth: date.getMonth() === month }
  }))
}

export function weekdayLabels(first: number, locale?: string): string[] {
  const names = new Intl.DateTimeFormat(locale, { weekday: "short" })
  return Array.from({ length: 7 }, (_, i) => names.format(new Date(2023, 0, 1 + ((first + i) % 7))))
}

// Typed times: "9", "930", "9:30", "9.30", "2:05pm", "14:05", "9 a.m.".
export function parseTimeOfDay(text: string): { h: number; mi: number } | undefined {
  const m = /^\s*(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(text.replace(/\s+/g, " "))
  if (!m) return
  let h = Number(m[1]); const mi = m[2] === undefined ? 0 : Number(m[2])
  if (mi > 59) return
  if (m[3]) {
    if (h < 1 || h > 12) return
    h = (h % 12) + (m[3].toLowerCase() === "p" ? 12 : 0)
  } else if (h > 23) return
  return { h, mi }
}

export function formatTimeOfDay(h: number, mi: number, hour12: boolean): string {
  const mm = String(mi).padStart(2, "0")
  return hour12 ? `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}` : `${String(h).padStart(2, "0")}:${mm}`
}
