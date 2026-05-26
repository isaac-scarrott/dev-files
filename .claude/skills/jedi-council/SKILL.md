---
name: jedi-council
description: Convene the Jedi Council — a panel of expert sub-agents critiques an artifact through distinct discipline lenses (third-person analysis: security, CRO, accessibility, performance, conventions, editorial — not all engineers). Use when the user wants a multi-discipline review and phrases it as "expert panel", "different angles", "stress test", "red team", "second opinion", "poke holes", "convene the council", "jedi council", or wants work-in-progress critiqued before shipping — especially after a solo attempt has stalled or a decision has been locked. For routine PR or diff review use `code-review` instead; for first-person user reactions use `the-focus-group`.
---

# The Jedi Council

A panel of expert sub-agents critiques an artifact through distinct discipline lenses in the third person. The unifying trait of a council member is expertise grounded in a discipline (accessibility, pricing psychology, security architecture, copywriting), not a job title.

For first-person user-reaction review, use [`the-focus-group`](../the-focus-group/SKILL.md). Both can review the same artifact; the stance is what changes.

Start with the shared principles in [references/PANEL.md](references/PANEL.md). What's below is what's specific to the council's third-person stance.

## Casting — disciplines, not job titles

Each role owns one lens no other role on the panel holds. "Senior engineer" is too broad; that's a title, not a lens. "Performance reviewer focused on cache-key shape and TTL semantics" is the right granularity — narrow enough that no other reviewer could plausibly hold the same one.

Cast for what the artifact needs. A short README might warrant two lenses (editorial, new-hire onboarding). A retry policy with real prod consequences might warrant five (correctness, idempotency, observability, blast radius, contrarian). There's no minimum and no maximum that earns its keep past about ten. See [references/LENSES.md](references/LENSES.md) for a sampler — the lenses depend on what the artifact actually is, not on a fixed menu.

For locked decisions or high-stakes irreversibility, brief one role to argue the opposite. Without an explicit contrarian, panels drift toward consensus on whatever the prompt seeded.

## Per-role prompts

Each prompt names the role and its lens, includes the artifact once (path or inline), demands evidence (file:line where applicable), and acknowledges the panel ("you are Expert 3 of 5 — others hold the other angles"). Let experts propose options; don't ask them to rank pre-listed ones. The panel's value is in what it surfaces, not what it ratifies.

## What to surface

Findings grouped by who flagged them. Prose synthesis opening with the strongest line, quoting the most cutting line verbatim. Recommended next action. A question to the user about which action to apply.

When the artifact has real failure consequences, a prod-break-mode column on blocking findings earns its place. When it doesn't, don't manufacture one — the shape of the synthesis should match the shape of the artifact.

See [references/EXAMPLE.md](references/EXAMPLE.md) for worked examples at different scales.

## Advanced

- Shared principles, dispatch mechanics, round 2, failure modes: [references/PANEL.md](references/PANEL.md)
- Discipline-lens sampler: [references/LENSES.md](references/LENSES.md)
- Worked examples at different scales: [references/EXAMPLE.md](references/EXAMPLE.md)
