/** Reading the orchestrator/merger ledger (see orchestrator/protocol/LEDGER.md). */

export const COLUMNS = ['pr', 'holder', 'head', 'base', 'state', 'owner', 'note', 'what', 'since'] as const

export type Row = Record<(typeof COLUMNS)[number], string>

export type BucketName = 'input' | 'working' | 'merging' | 'parked' | 'planned' | 'landed' | 'done'

export type Bucket = { name: BucketName; title: string; color: string; rows: Row[] }

/** The sections drawn row by row, in the order the pane stacks them. `done` is not one of them:
 *  work that finished longer ago than the landed window is a line of counts at the foot. */
const SECTIONS: readonly { name: BucketName; title: string; color: string }[] = [
  { name: 'input', title: 'NEEDS YOU', color: 'warning' },
  { name: 'working', title: 'WORKING', color: 'claude' },
  { name: 'merging', title: 'MERGING', color: 'merged' },
  { name: 'landed', title: 'LANDED', color: 'success' },
  { name: 'parked', title: 'PARKED', color: 'inactive' },
  { name: 'planned', title: 'PLANNED', color: 'subtle' },
]

/** How each section reads in the status line, where the pane's titles are too loud. */
const STATUS_WORDS: Record<BucketName, string> = {
  input: 'need you',
  working: 'building',
  merging: 'merging',
  landed: 'landed',
  parked: 'parked',
  planned: 'planned',
  done: 'done',
}

const MINUTE = 60_000

/** How far back the landed section reaches. */
export const RECENT_MS = 4 * 60 * MINUTE

/** A row waiting on the owner for longer than this is drawn as overdue. */
export const STALE_MS = 20 * MINUTE

/** A verdict the owner has actually given. Anything else in that column — a question, a routing
 *  note such as "owner merges", an empty cell — leaves the row theirs to answer, since a row the
 *  pane shows too loudly costs less than one it hides. */
const VERDICT = /^(approved|standing|ship|merge it|go ahead|yes\b)/i

/** Sessions that hold a PR on everyone's behalf; any other holder is a builder worth naming. */
const COORDINATORS = new Set(['', '-', 'orchestrator', 'merger', 'owner'])

export function parseLedger(text: string): { rows: Row[]; decisions: string[] } {
  const rows: Row[] = []
  const decisions: string[] = []
  let section: 'rows' | 'decisions' = 'rows'
  for (const line of text.split('\n')) {
    if (line.startsWith('## Decisions')) {
      section = 'decisions'
      continue
    }
    if (section === 'decisions') {
      if (line.startsWith('- ')) decisions.push(line.slice(2).trim())
      continue
    }
    if (!line.startsWith('|') || line.startsWith('|---')) continue
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
    if (cells[0] === 'pr' || cells.every(cell => /^-*$/.test(cell))) continue
    const row = Object.fromEntries(COLUMNS.map((column, index) => [column, cells[index] ?? ''])) as Row
    if (row.pr !== '') rows.push(row)
  }
  return { rows, decisions }
}

/** Which section a row belongs in. An unknown state counts as work in flight, never as nothing. */
export function bucketOf(row: Row, now: number): BucketName {
  switch (row.state.toLowerCase()) {
    case 'planned':
      return 'planned'
    case 'input':
    case 'question':
      return 'input'
    case 'held':
    case 'blocked':
      return 'parked'
    case 'review':
      return VERDICT.test(row.owner) ? 'merging' : 'input'
    case 'ready':
    case 'queued':
    case 'merged':
    case 'deploying':
      return 'merging'
    case 'landed':
    case 'deployed':
    case 'closed':
    case 'done':
    case 'abandoned':
      return isRecent(row, now) ? 'landed' : 'done'
    default:
      return 'working'
  }
}

/** Whether a finished row is young enough for the landed section. An undated row never is. */
function isRecent(row: Row, now: number): boolean {
  const held = since(row, now)
  return held !== undefined && held <= RECENT_MS
}

/** The sections to draw, newest change first inside each, empty ones left out. */
export function sections(rows: readonly Row[], now: number): Bucket[] {
  function elapsed(row: Row): number {
    return since(row, now) ?? Number.POSITIVE_INFINITY
  }

  return SECTIONS.map(section => ({
    ...section,
    rows: rows.filter(row => bucketOf(row, now) === section.name).sort((a, b) => elapsed(a) - elapsed(b)),
  })).filter(section => section.rows.length > 0)
}

/** Work that finished before the landed window, as counts: `9 landed · 2 closed`. */
export function earlier(rows: readonly Row[], now: number): string {
  const counts = new Map<string, number>()
  for (const row of rows.filter(row => bucketOf(row, now) === 'done')) {
    const state = row.state.toLowerCase()
    counts.set(state, (counts.get(state) ?? 0) + 1)
  }

  return [...counts].map(([state, count]) => `${count} ${state}`).join(' · ')
}

/** A row's id as the pane labels it: `#6861` for a PR, the slug itself for planned work. */
export function label(row: Row): string {
  return /^\d+$/.test(row.pr) ? `#${row.pr}` : row.pr
}

/** What the row is, in words: its own summary, else its note, else its head. */
export function summary(row: Row): string {
  return row.what || row.note || row.head || ''
}

/** The right-hand detail: the state, and the builder holding it when that isn't a coordinator. */
export function standing(row: Row): string {
  const holder = COORDINATORS.has(row.holder.toLowerCase()) ? '' : row.holder
  return [row.state, holder].filter(part => part !== '').join(' ')
}

export function since(row: Row, now: number): number | undefined {
  if (row.since === '') return undefined
  const at = Date.parse(row.since)
  return Number.isNaN(at) ? undefined : Math.max(0, now - at)
}

export function age(row: Row, now: number): string {
  const held = since(row, now)
  if (held === undefined) return ''
  const minutes = Math.floor(held / MINUTE)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function isStale(row: Row, now: number): boolean {
  const held = since(row, now)
  return held !== undefined && held > STALE_MS
}

/** The status-line summary: the sections that have rows, in the pane's order. */
export function statusLine(rows: readonly Row[], now: number): string | undefined {
  const drawn = sections(rows, now)
  if (drawn.length === 0) return undefined

  return `orch: ${drawn.map(section => `${section.rows.length} ${STATUS_WORDS[section.name]}`).join(' · ')}`
}
