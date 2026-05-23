---
name: jedi-council
description: Convene the Jedi Council — a panel of expert sub-agents critiques an artifact through distinct discipline lenses (third-person analysis: security, CRO, accessibility, performance, conventions, editorial — not all engineers). Use when the user wants a multi-discipline review and phrases it as "expert panel", "different angles", "stress test", "red team", "second opinion", "poke holes", "convene the council", "jedi council", or wants work-in-progress critiqued before shipping — especially after a solo attempt has stalled or a decision has been locked. For routine PR or diff review use `code-review` instead; for first-person user reactions use `the-focus-group`.
---

# The Jedi Council

A panel of expert sub-agents critiques an artifact through distinct discipline lenses in the third person. The unifying trait of a council member is expertise grounded in a discipline (accessibility, pricing psychology, security architecture, copywriting), not a job title.

For first-person user-reaction review, use [`the-focus-group`](../the-focus-group/SKILL.md). Both can review the same artifact; the skills are interchangeable on topic but the stance is different.

## Quick start

1. Point at a concrete artifact (diff, plan, design doc, copy draft). If none exists, run `/grill-me` first.
2. Cast 3–7 roles with distinct discipline lenses. See [references/LENSES.md](references/LENSES.md) for a sampler — the right roles depend on the artifact.
3. Dispatch in parallel and synthesize. Shared mechanics in [references/PANEL.md](references/PANEL.md).
4. Reply in chat: convergence table → prose synthesis (opening with the strongest line) → recommended next action → a question to the user about which action to apply.

## Per-role prompts

Each prompt names the role and its lens, includes the artifact once, demands evidence (file:line where applicable), sets severity labels (BLOCKING / SUGGESTION / NIT), and acknowledges the panel ("you are Expert 3 of 5 — others hold the other angles"). For high-stakes decisions, brief one role to argue the opposite; without that, panels drift toward consensus.

Let experts propose options. Don't ask them to rank pre-listed ones — the panel's value is in what it surfaces.

## What to reply with

- **Convergence table** with a prod-break-mode column for every BLOCKING — the concrete bad thing that happens in production if it is not fixed.
- **2–3 paragraphs of prose** that open with the strongest finding, cluster related findings by root cause, and quote the most cutting line verbatim.
- **Recommended next action** — implement N items, run round 2 on X, or reframe the question.
- **A question** to the user about which next action to apply.

See [references/EXAMPLE.md](references/EXAMPLE.md) for a worked example.

## Implement → review pair

After synthesis, when implementation begins: dispatch an implementer with numbered acceptance criteria, then a fresh-eyes reviewer briefed *"You did NOT write this code. Verify pass/fail per criterion with one line of evidence."* The framing changes how the reviewer reads the diff.

## Advanced

- Shared dispatch mechanics, convergence rules, round-2, closing the loop: [references/PANEL.md](references/PANEL.md)
- Discipline-lens sampler: [references/LENSES.md](references/LENSES.md)
- Worked example: [references/EXAMPLE.md](references/EXAMPLE.md)
