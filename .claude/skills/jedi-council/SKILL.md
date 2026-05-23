---
name: jedi-council
description: Convene the Jedi Council — dispatch a panel of expert sub-agents to critique an artifact (code, plan, design, copy, architecture, docs) from multiple discipline angles. Each Jedi brings a different discipline (security, CRO, accessibility, design systems, conventions, performance, pricing psychology, editorial) — not all are engineers. Use when the user asks for "expert sub-agents to review", "different angles", "rounds of feedback", "panel of experts", "convene the council", "jedi council", or wants work-in-progress stress-tested through expert lenses — especially after a solo attempt has stalled or a decision has been locked.
---

# The Jedi Council

A panel of expert sub-agents critiques an artifact from distinct discipline lenses, then findings are synthesised by convergence. A council member's unifying trait is wise expertise grounded in a discipline — not a job title. Accessibility consultants, pricing psychologists, security architects, copywriters all belong on the council when the work touches their domain.

The distinction from `the-focus-group` is **stance**, not topic: a Jedi gives third-person discipline analysis; a Focus Group member reacts in first person from lived friction. Both can review the same artifact.

## Quick start

1. Point at a concrete artifact (diff, plan, design doc, copy draft). If none exists yet, run `/grill-me` first.
2. Cast 3–7 roles with distinct discipline lenses. See [references/LENSES.md](references/LENSES.md) for the menu.
3. Dispatch all in parallel via the Agent tool (`subagent_type: general-purpose`). Parallel is non-negotiable — sequential dispatches collapse the panel into one voice in N hats.
4. Reply in chat: convergence table → prose → one-line punch verdict → recommended next action. The synthesis is a conversation turn, not a file.

## Workflow

### Per-role prompts

Each prompt names the role and its lens, includes the artifact once, demands evidence (file:line where applicable), sets severity labels, and acknowledges the panel ("you are Expert 3 of 5 — others hold the other angles"). For high-stakes decisions, brief one role to argue the opposite — without an explicit contrarian, panels drift toward consensus.

Do not pre-lock the option set. The panel's value is in the options it surfaces, not the ones it ranks.

### What to reply with

Four parts, sent back in the same chat turn:

1. **Convergence table** with a prod-break-mode column for every BLOCKING — the concrete bad thing that happens in production if it is not fixed.
2. **2–3 paragraphs of prose** that cluster findings by root cause and quote the most cutting line verbatim.
3. **One-line punch verdict** — the sentence the user would quote in standup.
4. **Recommended next action** — implement N items, run round 2 on X, or reframe the question.

Then close with a question to the user about which action to apply. Recommendations aren't decisions — the panel surfaces, the user adjudicates. Use AskUserQuestion when the next-action options are concrete picks (flag the option you'd recommend), or a short freeform grill (in the spirit of `/grill-me`) when the right call needs context only the user has.

See [references/EXAMPLE.md](references/EXAMPLE.md) for a worked example.

### Reading convergence

A 1/5 finding is not weak when only one lens could have caught it. If the performance reviewer is the only role scoped to spot an N+1, silence from the others tells you nothing. Mark sole-owner findings explicitly and treat them as load-bearing.

### Round 2

Only when a concrete dispute remains. Round 2 prompts must thread the prior round back — give each reviewer the others' positions and ask them to react, not restate. Stop at round 2; round 3 rarely earns its cost.

### Implement → review pair

After synthesis, when implementation begins: dispatch an implementer with numbered acceptance criteria, then a fresh-eyes reviewer briefed *"You did NOT write this code. Verify pass/fail per criterion with one line of evidence."* The framing shifts the reviewer's stance from defending to auditing.

## Failure modes

- **Convergence-but-wrong.** Panel agrees on a flawed premise the prompts baked in. Classic shape: pre-locked option set.
- **Structure swallowing substance.** A table with no prose is a checklist masquerading as a review.
- **Round inflation.** Round 1 finds problems; round 2 verifies fixes; round 3 is noise.
- **Generic experts.** "Senior engineer" is too broad — discipline lenses need to be specific.
- **Comment creep.** Implementers add code comments unless told not to.

## Advanced

- Discipline-lens menu: [references/LENSES.md](references/LENSES.md)
- Worked example: [references/EXAMPLE.md](references/EXAMPLE.md)
