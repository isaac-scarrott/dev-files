---
name: the-focus-group
description: Convene the Focus Group — a panel of named user or stakeholder personas with rich CVs reacts to an artifact in first-person from lived friction (what they would actually hit when using the thing). Use when the user wants user-level reaction on a design, flow, copy, paywall, or onboarding and phrases it as "persona feedback", "spin up users", "panel of users", "focus group", "what would users actually do", "stress test through user eyes" — for product surfaces where lived perspective matters more than technical correctness. For third-person discipline-based analysis (engineering, design system, CRO) use `jedi-council` instead.
---

# The Focus Group

A panel of named personas reacts to an artifact in first person, in character. Personas notice the friction that comes from actually using the thing — what no abstract reviewer will.

For third-person discipline analysis, use [`jedi-council`](../jedi-council/SKILL.md). Both can review the same artifact; the stance is what changes.

Start with the shared principles in [../jedi-council/references/PANEL.md](../jedi-council/references/PANEL.md). What's below is what's specific to the focus group's first-person stance.

## Casting — lived-in, not thin

The bones (name, age, role) are the minimum. Depth lives in the friction.

> **Thin (a category in a costume):** Maria, 54, private tutor. Veteran. Cares about her students.

> **Lived-in (a person):** Maria, 22 years tutoring secondary maths. Built a private practice after a decade in classrooms. Most clients are families with multiple children; she has notes on teaching the older siblings. Half her value-add lives in one line of the parent report: *"he still confuses subtraction and negative-number signs the way his sister did at the same age."*

Thin produces textbook critique. Lived-in produces lines that drive a real design change. The friction comes from specifics — a named client, a tool they hate, a workaround they've built, a metric they live by. At least one of those per persona.

Cast for what the artifact needs. A single piece of copy might want three personas (the target user, an edge case, a sceptic). A whole first-week experience might want six. Span the user base — power user, novice, veteran comparing to a legacy tool, edge case (accessibility, mobile-only, low-trust), and an explicit sceptic briefed to find the worst version. Ten power users with different names is one persona in ten hats.

## Per-persona prompts

Open with the full CV. Reference the artifact by path. Force first person, in character, no breaks for meta-commentary. License honesty — *"don't be polite, focus on what stands out, end with one specific thing you'd change first"*. Without the no-hedging licence, personas default to polite, and polite produces nothing.

## What to surface

The synthesis is rendered as a **self-contained HTML report** written to the OS temp directory and opened — see [../jedi-council/references/REPORT.md](../jedi-council/references/REPORT.md) for the shared scaffold, the temp-dir mechanics, and the rule that the decision still happens in chat. The focus group's tailored design inside that scaffold:

- **Persona cards** — each persona's CV up top (name, the lived-in friction, the tool they hate or metric they live by), so a reaction is read in the voice of a specific person, not an anonymous "user".
- **First-person quotes as the centrepiece** — render each persona's verbatim lines as large pull-quotes attributed to them. The voices are the value; don't flatten them into table cells.
- **Action distribution** — a hand-built visual (a tally or bar) of what each persona would actually *do* on landing: convert, churn, bounce, abandon mid-flow. Convergence groups findings; action gives them meaning, so make the distribution the visual anchor.
- **Findings grouped by who flagged what**, with a **verdict badge** (`KILL` red, `High`/`Medium`/`Low` graded) and persona chips showing convergence. Flag sole-owner findings explicitly — the one persona scoped to catch something (the long-term practitioner, the accessibility edge case) is load-bearing, not a weak vote.
- **Recommended next action** in the report; the **question about which action to apply** stays a live question via the question tool in chat.

See [references/EXAMPLE.md](references/EXAMPLE.md) and [references/EXAMPLE_2.md](references/EXAMPLE_2.md) for worked examples in different domains — read both before casting your own to see the range. The convergence tables and synthesis there are the *content* that renders into the HTML report.

## Advanced

- Shared principles, dispatch mechanics, round 2, failure modes: [../jedi-council/references/PANEL.md](../jedi-council/references/PANEL.md)
- HTML report scaffold, temp-dir mechanics, chat-vs-report split: [../jedi-council/references/REPORT.md](../jedi-council/references/REPORT.md)
- Worked examples: [references/EXAMPLE.md](references/EXAMPLE.md), [references/EXAMPLE_2.md](references/EXAMPLE_2.md)
