# Runbook shape

Sections in reading order. Keep each one current; the runbook is edited first and chat summarises after.

1. **Title and byline**: project name, as-of date, owner.
2. **Source-of-truth line** (bold): this runbook is the source of truth; anything elsewhere that disagrees loses until the runbook is updated.
3. **Where we are**: paused or active date; current milestone; waiting on whom for what; next action; parked items; where research files live; how to resume ("resume the X runbook").
4. **How we work**: one owning session; questions before work; plan a milestone before dispatch; dispatch by number; outcomes recorded; milestone exit on its check; no silent changes; how to resume.
5. **Scope and principles**: what is in and out, and the rules every item follows, each citing its decision number.
6. **Milestones**: table of milestone, what you'll see, how we check it, items.
7. **Work items**: table of number (1a, 1b, 2a… grouped by workstream), item, depends on, decisions, status, outcome. Status is a dropdown: Todo, In progress, Merging, Done.
8. **Decisions**: table of D-number, decision, trade-off we own. Amendments name the decision they change.
9. **Open questions**: numbered by milestone (M1.1…), each written to stand alone (its own context, options with costs, recommendation), the same text as the chat round that asked it. "None" when the frontier is empty.
10. **Parked issues**: known-wrong things found along the way that don't block this project, each with its evidence.
11. **Later phases**: what was deliberately left out and why.
12. **How it fits together**: one diagram of the system's parts and flow.
13. **Research**: table of study, finding with numbers, file path. Paths point at durable storage.

## Keeping it readable

The main tab is read by a person who scans, so each section is a table or a short list and each cell is one line. Detail sits one click down, never inline:

- **Decisions** show the current position only: one line plus the trade-off, a superseded decision folded into its replacement's row (`D3 / D21 / D25`). The full wording, evidence and amendments live on a second tab, the **Decision log**, one row per decision with a History column.
- **Research** is one row per study: a one-line finding and the path of the full report. Findings never run to paragraphs here.
- **Where we are** is five bullets: now, waiting on whom, next, parked, research files.
- **Open questions** hold only what is unanswered; an answered one becomes a decision and leaves the table.
- Work items carry the status dropdown; the outcome cell is one line with a link or path.
- The diagram is a drawn widget, not a list. Create the status enum after the doc is born, then place its dropdown chips.
- When the runbook has grown long, rebuild it in this shape rather than appending; mark the old copy superseded with a link to the new one.

Numbering is the interface: items, decisions and questions keep their numbers for life. A dropped item stays in place with status Done and its outcome reading "Dropped: <reason>".
