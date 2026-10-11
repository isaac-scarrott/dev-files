import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { age, bucketOf, earlier, isStale, label, parseLedger, sections, standing, statusLine, summary } from './ledger'

const NOW = Date.parse('2026-10-11T12:00')

const LEDGER = `# PR ledger

| pr | holder | head | base | state | owner | note | what | since |
|---|---|---|---|---|---|---|---|---|
| 6861 | merger | 740d210e6a | master | review | not yet asked | after #6847 | Lift tracking banner | 2026-10-11T11:30 |
| 6847 | merger | aa11bb22cc | master | queued | approved (merger, 11:01) |  | Price rounding | 2026-10-11T11:55 |
| 6902 | builder-b | cc33dd44ee | master | building |  |  | Agent filters | 2026-10-11T11:58 |
| 7000 | builder-b | dd44ee55ff | master | draft |  | held for owner run-through | Trip dialog | 2026-10-11T09:40 |
| 6799 | orchestrator | ee55ff66aa | master | held | hold, waits on the API | blocked upstream | Supplier sync | 2026-10-09T09:00 |
| payments-retry |  |  |  | planned |  | needs a data contract first |  | 2026-10-11T10:00 |
| 6840 | merger | ff66aa77bb | master | landed |  | deploy 37223103954 | Cart footer | 2026-10-11T10:30 |
| 6830 | merger | aa88bb99cc | master | landed |  |  | Rail bleed | 2026-10-10T18:00 |
| 6820 | merger | bb99cc00dd | master | closed | owner closed |  | Old spike | 2026-10-09T12:00 |

## Decisions

- 2026-10-10: never queue after 18:00
`

test('the ledger parses to one row per line, and its decisions', () => {
  const { rows, decisions } = parseLedger(LEDGER)
  expect(rows.length).toBe(9)
  expect(rows[0]?.pr).toBe('6861')
  expect(rows[0]?.what).toBe('Lift tracking banner')
  expect(decisions).toEqual(['2026-10-10: never queue after 18:00'])
})

test('a row with fewer cells than columns still parses', () => {
  const { rows } = parseLedger('| 7001 | merger | abc | master | queued |\n')
  expect(rows[0]?.state).toBe('queued')
  expect(rows[0]?.since).toBe('')
})

test('each state lands in the section the pane shows it under', () => {
  const { rows } = parseLedger(LEDGER)
  expect(rows.map(row => bucketOf(row, NOW))).toEqual([
    'input',
    'merging',
    'working',
    'working',
    'parked',
    'planned',
    'landed',
    'done',
    'done',
  ])
})

test('a PR in review is the owner’s while their verdict is missing, and merging once approved', () => {
  const asked = parseLedger('| 1 | merger | a | master | review | not yet asked |\n').rows[0]!
  const testing = parseLedger('| 2 | merger | a | master | review | testing |\n').rows[0]!
  const approved = parseLedger('| 3 | merger | a | master | review | approved (merger) |\n').rows[0]!
  expect([asked, testing, approved].map(row => bucketOf(row, NOW))).toEqual(['input', 'input', 'merging'])
})

test('a state nobody has written yet counts as work in flight, never as nothing', () => {
  const row = parseLedger('| 9 | builder-a | a | master | rebasing |\n').rows[0]!
  expect(bucketOf(row, NOW)).toBe('working')
})

test('work that finished inside the landed window is drawn, and older work is only counted', () => {
  const { rows } = parseLedger(LEDGER)
  const landed = sections(rows, NOW).find(section => section.name === 'landed')
  expect(landed?.rows.map(label)).toEqual(['#6840'])
  expect(earlier(rows, NOW)).toBe('1 landed · 1 closed')
})

test('a finished row with no stamp is counted as earlier, never dated by guesswork', () => {
  const { rows } = parseLedger('| 5 | merger | a | master | landed |\n')
  expect(bucketOf(rows[0]!, NOW)).toBe('done')
  expect(earlier(rows, NOW)).toBe('1 landed')
})

test('sections come in the pane’s order, newest change first, and leave out the empty ones', () => {
  const { rows } = parseLedger(LEDGER)
  const drawn = sections(rows, NOW)
  expect(drawn.map(section => section.name)).toEqual(['input', 'working', 'merging', 'landed', 'parked', 'planned'])
  expect(drawn.find(section => section.name === 'working')?.rows.map(label)).toEqual(['#6902', '#7000'])
  expect(sections([], NOW).length).toBe(0)
})

test('a row is labelled by PR number, or by its slug when there is no PR', () => {
  const { rows } = parseLedger(LEDGER)
  expect(rows.map(label).slice(0, 6)).toEqual(['#6861', '#6847', '#6902', '#7000', '#6799', 'payments-retry'])
  expect(summary(rows[5]!)).toBe('needs a data contract first')
})

test('the standing names the builder holding a row, and never the coordinating sessions', () => {
  const { rows } = parseLedger(LEDGER)
  expect(standing(rows[2]!)).toBe('building builder-b')
  expect(standing(rows[1]!)).toBe('queued')
})

test('age reads in the largest unit that fits, and is blank without a stamp', () => {
  const { rows } = parseLedger(LEDGER)
  expect(age(rows[0]!, NOW)).toBe('30m')
  expect(age(rows[4]!, NOW)).toBe('2d')
  expect(age(parseLedger('| 1 | merger | a | master | queued |\n').rows[0]!, NOW)).toBe('')
})

test('a row waiting on the owner past twenty minutes is stale', () => {
  const { rows } = parseLedger(LEDGER)
  expect(isStale(rows[0]!, NOW)).toBe(true)
  expect(isStale(rows[2]!, NOW)).toBe(false)
})

test('the status line counts every section that has rows, and is empty with none', () => {
  const { rows } = parseLedger(LEDGER)
  expect(statusLine(rows, NOW)).toBe('orch: 1 need you · 2 building · 1 merging · 1 landed · 1 parked · 1 planned')
  expect(statusLine([], NOW)).toBeUndefined()
})

const PANE = {
  component: 'Pane',
  requestId: 'orchestration',
  props: {
    title: 'Orchestration',
    isFocused: false,
    bodyColumns: 56,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

/** Stands in for the engine beneath the mod: the ledger it finds and what the file holds. */
function ledgerOnDisk(on: On, text: string) {
  mock.clock(on, { now: NOW })
  mock.env(on, { ORCHESTRATION_LEDGER: '/tmp/ledger.md' })
  on('fs.stat', async () => ({ value: { kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false } }))
  on('fs.read', async () => ({ value: text }))
}

test('the pane draws every section of the ledger it is pointed at, on every surface', async ($, on) => {
  ledgerOnDisk(on, LEDGER)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'orchestration-view', surface, ...PANE })
    for (const title of ['NEEDS YOU', 'WORKING', 'MERGING', 'LANDED', 'PARKED', 'PLANNED']) {
      expect(await ui.find({ type: 'Text', text: new RegExp(title) })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: '#6861' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Lift tracking banner' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'payments-retry' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1 landed · 1 closed earlier' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '#6830' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a long section is capped, and says how many it is holding back', async ($, on) => {
  const many = Array.from(
    { length: 15 },
    (_, index) => `| ${7100 + index} | builder-a | a${index} | master | draft |  |  | Item ${index} | 2026-10-11T11:00 |`,
  ).join('\n')
  ledgerOnDisk(on, `# PR ledger\n\n| pr | holder | head | base | state | owner | note | what | since |\n|---|---|---|---|---|---|---|---|---|\n${many}\n`)

  const ui = await $.ui.mount({ plugin: 'orchestration-view', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '#7111' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '#7112' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '  +3 more' })).toBeDefined()
  await ui.unmount()
})

test('an empty ledger draws as nothing in flight, not as an error', async ($, on) => {
  ledgerOnDisk(on, '# PR ledger\n\n| pr | holder | head | base | state | owner | note | what | since |\n|---|---|---|---|---|---|---|---|---|\n')

  const ui = await $.ui.mount({ plugin: 'orchestration-view', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Nothing in flight/ })).toBeDefined()
  await ui.unmount()
})
