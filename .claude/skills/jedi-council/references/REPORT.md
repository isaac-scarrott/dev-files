# HTML Report Format (shared)

Both `jedi-council` and `the-focus-group` render their findings as a single self-contained HTML file in the OS temp directory, then open it. The mechanics, scaffold, and styling below are shared. Each skill's `SKILL.md` describes the tailored card design that goes *inside* this scaffold — the council's discipline lenses, the focus group's persona cards and action distribution.

## What goes in the report vs. the chat

The report **surfaces**; the user still **decides** in chat.

- **In the HTML:** the full synthesis — findings grouped by who flagged them, convergence and sole-owner flags, verbatim quotes, the prose verdict, and the recommended next action.
- **In the chat:** a one-line pointer (`Report written to <absolute path> — opened it.`) and then the decision prompt. The "user decides" close from [PANEL.md](PANEL.md) stays a live `AskUserQuestion` (or a short freeform grill) — it can't live in static HTML, and burying the choices in the file defeats the point of asking.

**No panel, no report.** If the artifact is small enough to answer in a paragraph (PANEL.md's refuse-to-convene outcome — the Slack-status case), don't manufacture a file. Answer directly in chat. The report is for findings worth a panel, not ceremony.

## Where to write it

Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows). Write to `<tmpdir>/<skill>-<timestamp>.html` so each run gets a fresh file — `jedi-council-<timestamp>.html` or `focus-group-<timestamp>.html`. Nothing lands in the repo.

Open it — `open <path>` on macOS, `xdg-open <path>` on Linux, `start <path>` on Windows — and tell the user the absolute path.

## Scaffold

**Tailwind via CDN** for layout and styling. **No Mermaid** — neither report is graph-shaped. Reach for hand-built `<div>`s and inline SVG for the visuals each skill calls for (convergence rows, action-distribution bars, severity rails).

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{{Jedi Council | Focus Group}} — {{artifact name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      /* small custom layer for things Tailwind doesn't cover cleanly:
         severity rails, pull-quote marks, action-distribution bars. */
      .pullquote::before { content: "\201C"; }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <header>...</header>
      <section id="findings" class="space-y-8">...</section>
      <section id="synthesis">...</section>
      <section id="next">...</section>
    </main>
  </body>
</html>
```

## Header

Artifact name, date, the panel roster (who was cast and the one lens each held), and a compact legend for whatever badges the report uses. No throat-clearing paragraph — straight into the findings.

## Shared style guidance

- **The quotes carry the report.** Both skills live on verbatim lines — the council's most cutting line, each persona's voice. Render quotes as the visual centrepiece (large pull-quotes, generous whitespace), not as table cells.
- **Findings grouped by who flagged them**, with convergence shown visually (a row of lens/persona chips per finding). Flag sole-owner findings explicitly — a 1/N from the only lens scoped to catch it is load-bearing, not weak. Don't let a convergence count read as a vote.
- Lean editorial, not corporate-dashboard. Generous whitespace. `font-serif` headings work well with stone/slate.
- Colour sparingly: one accent plus red for blocking/kill verdicts and amber for warnings.
- The report is static — the only script is the Tailwind CDN. No interactivity.
- Match the report's weight to the artifact (PANEL.md): a two-lens README review is a short page; a five-lens reliability review earns more structure. Don't pad a small panel into a dashboard.
