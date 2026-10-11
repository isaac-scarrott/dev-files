import type { EngineInterface, Register, UiOpenResult } from 'claude-code'

import {
  age,
  earlier,
  isStale,
  label,
  parseLedger,
  sections,
  standing,
  statusLine,
  summary,
  type Bucket,
  type Row,
} from './ledger'

const PANE = 'orchestration'
const POLL_MS = 4000

/** Rows drawn per section before the rest become a count. Everything waiting on the owner is drawn. */
const MOST = 12

let path: string | undefined
let drawnAt = -1
let announced = new Set<string>()
let isDismissed = false

function openPane($: EngineInterface): Promise<UiOpenResult> {
  return $.ui.open({ id: PANE, title: 'Orchestration' })
}

async function ledgerPath($: EngineInterface): Promise<string | undefined> {
  if (path !== undefined) return path
  // ORCHESTRATION_LEDGER reads a ledger somewhere other than the repo's own (tests, a second repo).
  const given = await $.env.get('ORCHESTRATION_LEDGER')
  if (given !== undefined && given !== '') return (path = given)
  const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir']).catch(
    () => undefined,
  )
  if (git === undefined || git.exitCode !== 0) return undefined
  return (path = `${git.stdout.trim()}/orchestration/ledger.md`)
}

async function readRows($: EngineInterface): Promise<{ rows: Row[]; mtimeMs: number; at: string | undefined }> {
  const at = await ledgerPath($)
  if (at === undefined) return { rows: [], mtimeMs: -1, at }
  const stat = await $.fs.stat(at).catch(() => undefined)
  if (stat === undefined) return { rows: [], mtimeMs: -1, at }
  const text = await $.fs.read(at).catch(() => '')

  return { rows: parseLedger(text).rows, mtimeMs: stat.mtimeMs, at }
}

/** What a toast is keyed by. The head is in it, so a row that comes back on new work is said again. */
function toastKey(row: Row): string {
  return `${label(row)}@${row.head}`
}

/** Reads the ledger, pins the counts under the prompt, and says when a row starts waiting on the owner. */
async function poll($: EngineInterface): Promise<void> {
  const { rows, mtimeMs } = await readRows($)
  const now = await $.clock.now()
  $.ui.status(statusLine(rows, now))

  const waiting = sections(rows, now).find(section => section.name === 'input')?.rows ?? []
  for (const row of waiting) {
    if (!announced.has(toastKey(row))) $.ui.toast(`${label(row)} needs you — ${summary(row) || row.state}`)
  }
  announced = new Set(waiting.map(toastKey))

  if (rows.length > 0 && !isDismissed) {
    const panes = await $.ui.panes()
    if (!panes.some(pane => pane.id === PANE)) await openPane($)
  }
  if (mtimeMs !== drawnAt) {
    drawnAt = mtimeMs
    $.ui.invalidate('ui.render')
  }
}

/** A column as wide as its widest cell, within the room the pane can spare for it. */
function columnWidth(cells: readonly string[], least: number, most: number): number {
  return Math.min(most, Math.max(least, ...cells.map(cell => cell.length)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'orch',
      description: 'Orchestration: what is planned, being worked on, waiting on you, parked, merging and landed',
    })
    const started = await next(e)
    void poll($).catch(() => {})
    $.clock.every(POLL_MS, () => void poll($).catch(() => {}))

    return started
  })

  on('command.run', { command: 'orch' }, async $ => {
    isDismissed = false
    const { rows, at } = await readRows($)
    const now = await $.clock.now()
    await openPane($)
    if (at === undefined) return { text: 'No repository here, so no ledger to watch.' }
    if (rows.length === 0) return { text: `Nothing in flight. Ledger: ${at}` }

    const lines = sections(rows, now).map(
      section => `${section.title}: ${section.rows.map(row => `${label(row)} ${summary(row)}`.trim()).join(', ')}`,
    )
    const over = earlier(rows, now)

    return { text: [`Ledger: ${at}`, ...lines, ...(over === '' ? [] : [`earlier: ${over}`])].join('\n') }
  })

  // A pane the person closes stays closed for the session.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') isDismissed = true

    return next(e)
  })

  // Starting either skill is a reason to show the pane, before the first row lands.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const skill = (e as { skill?: string }).skill
    if (skill === 'orchestrator' || skill === 'merger') {
      isDismissed = false
      void openPane($).catch(() => {})
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { rows, at } = await readRows($)
    const now = await $.clock.now()
    const drawn = sections(rows, now)
    const over = earlier(rows, now)

    if (drawn.length === 0) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{over === '' ? 'Nothing in flight.' : `Nothing in flight · ${over} earlier`}</Text>
          <Text dimColor wrap="truncate-start">
            {at ?? 'no repository here'}
          </Text>
        </Box>
      )
    }

    // One set of column widths across every section, so the pane reads as one table.
    const columns = Math.max(28, e.props.bodyColumns)
    const quarter = Math.floor(columns / 4)
    const allRows = drawn.flatMap(section => section.rows)
    const idWidth = columnWidth(allRows.map(label), 4, quarter)
    const standingWidth = columnWidth(allRows.map(standing), 0, quarter)
    const ageWidth = columnWidth(allRows.map(row => age(row, now)), 2, 5)

    function drawSection(section: Bucket) {
      const needsYou = section.name === 'input'
      const settled = section.name === 'parked' || section.name === 'landed'
      const shown = needsYou ? section.rows : section.rows.slice(0, MOST)
      const more = section.rows.length - shown.length

      function idColor(row: Row): string | undefined {
        if (needsYou && isStale(row, now)) return 'error'
        if (needsYou) return section.color
        return undefined
      }

      return (
        <Box key={section.name} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={section.color} bold>
              ▌{section.title}
            </Text>
            <Text dimColor>{String(section.rows.length)}</Text>
          </Box>
          {shown.map(row => (
            <Box key={`${section.name}-${row.pr}`} flexDirection="row" gap={1}>
              <Box width={idWidth} flexShrink={0}>
                <Text color={idColor(row)} wrap="truncate-end">
                  {label(row)}
                </Text>
              </Box>
              <Box flexGrow={1} overflow="hidden">
                <Text wrap="truncate-end" dimColor={settled}>
                  {summary(row)}
                </Text>
              </Box>
              <Box width={standingWidth} flexShrink={0}>
                <Text dimColor wrap="truncate-end">
                  {standing(row)}
                </Text>
              </Box>
              <Box width={ageWidth} flexShrink={0} justifyContent="flex-end">
                <Text dimColor>{age(row, now)}</Text>
              </Box>
            </Box>
          ))}
          {more > 0 && <Text dimColor>{`  +${more} more`}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {drawn.map(section => drawSection(section))}
        {over !== '' && <Text dimColor>{`${over} earlier`}</Text>}
      </Box>
    )
  })
}
