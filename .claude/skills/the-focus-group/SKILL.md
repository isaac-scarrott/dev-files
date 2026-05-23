---
name: the-focus-group
description: Convene the Focus Group — dispatch a panel of named user or stakeholder personas with rich CVs and in-character first-person reactions to a design, flow, copy, paywall, or onboarding artifact. Use when the user asks for "persona feedback", "spin up user personas", "panel of users", "focus group", "what would users think", or wants any design/flow/copy artifact stress-tested through stakeholder eyes — for any product surface where lived perspective matters more than technical correctness.
---

# The Focus Group

A panel of named personas reacts to an artifact in first person, in character, with the friction and biases of someone using the thing for real. Personas notice things experts never will — that share-link affordances matter more than browse, that a per-unit pricing assumption breaks for grouped purchases, that a "free trial" feels like hostage-taking after a long onboarding.

The distinction from `jedi-council` is **stance**, not topic: a Jedi gives third-person discipline analysis; a Focus Group member reacts from lived friction. Both can review the same artifact. High-stakes review often benefits from both, in separate waves.

## Quick start

1. Point at a concrete artifact (design, flow, copy draft, paywall). If none exists yet, run `/grill-me` first.
2. Cast 5–10 named personas spanning the user base. The CV needs to feel lived-in — see [Casting](#casting) below.
3. Dispatch all in parallel via the Agent tool (`subagent_type: general-purpose`).
4. Reply in chat: convergence table → predicted action distribution → verbatim quotes embedded in prose → one-line punch verdict. The synthesis is a conversation turn, not a file.

## Workflow

### Casting

The bones — name, age, role — are the minimum. Depth is in the friction. Compare:

> **Thin (a category in a costume):** Maria, 54, private tutor. Veteran. Cares about her students.

> **Lived-in (a person):** Maria, 22 years tutoring secondary maths. Built a private practice after a decade in classrooms. Most clients are families with multiple children; she has notes on teaching the older siblings. Half her value-add lives in one line of the parent report: *"he still confuses subtraction and negative-number signs the way his sister did at the same age."*

The thin version produces textbook critique. The lived-in version produces *"where does that note go in the new app?"* — the kind of line that drives a real design change.

Aim for 60–100 words per CV with at least one of: a named client, a specific past transaction, a tool they hate, a workaround they've built, or a metric they live by. Span the user base — power user, novice, veteran comparing to a legacy tool, an edge case (accessibility, mobile-only, low-trust), and an explicit UX sceptic briefed to find the worst version. Ten power users with different names is one persona in ten hats.

### Per-persona prompt

Open with the full CV. Reference the artifact by path. Force in-character first person and licence honesty — *"stay fully in character, don't break to add meta-commentary, don't be polite, focus on what stands out"*. Cap length and ask each persona to end with one specific thing they would change first. Without the no-hedging licence, personas default to polite.

### What to reply with

Four parts, sent back in the same chat turn:

1. **Convergence table** — what was flagged, by whom, how widely.
2. **Predicted action distribution** — what each persona would actually *do* on landing (convert, churn, bounce, abandon mid-flow). Convergence is the grouping; action is the meaning.
3. **Verbatim quotes** embedded in prose, not just listed. The voices are the value.
4. **One-line punch verdict** — the sentence the user would quote in standup.

See [references/EXAMPLE.md](references/EXAMPLE.md) for a worked example.

### Round 2

Only if the design changes meaningfully. Run with the **same personas** and tell them what changed — continuity is part of the value, do not swap mid-review. Stop at round 2; round 3 rarely earns its cost.

### Panel as input, not authority

Users sometimes override panel consensus when their judgment differs — keeping a controversial pricing anchor against a pricing-psychologist's recommendation, for instance. The panel surfaces; the user decides.

## Failure modes

- **Generic personas.** A category in a costume produces textbook output. Need named details and lived friction.
- **Break-character drift.** Personas slip into meta-commentary. Reinforce the in-character framing every round.
- **Politeness creep.** Restate the no-hedging licence each round.
- **Visual taste plateau.** By round 3 of visual design, personas restate. Switch to prescribing a reference app or shipping for real feedback.
- **Echo of casting.** If all personas share a profile, the panel is one persona in N hats.
- **Structure swallowing voice.** A clean table with no quotes is a feedback form, not a panel.

## Advanced

- Worked example with sample personas, prompts, and synthesis: [references/EXAMPLE.md](references/EXAMPLE.md)
