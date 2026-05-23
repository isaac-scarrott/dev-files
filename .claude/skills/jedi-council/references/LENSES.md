# Discipline lenses for the Jedi Council

Each role should own one lens no other role owns. "Senior engineer" is too broad. "Performance reviewer focused on N+1 queries and per-request caching" is right. Pick the lenses that match the artifact under review. Five roles is usually right. Three is the floor; convergence is meaningless below that. Ten is the ceiling for one round.

## Engineering lenses

- **Security / threat model** — auth, key management, token transport, attack surface
- **Backend correctness** — semantics, ordering, edge cases, transactional safety
- **Conventions / project idioms** — does this match how the rest of the codebase does it?
- **Tests / test design** — coverage, fixtures, what's missing
- **Performance** — hot paths, N+1 patterns, caching strategy, TTL semantics
- **Side-effects / blast radius** — what fails if this is wrong, rollback story
- **Simplicity / over-engineering** — "could this be 50 lines instead of 200?"
- **Architecture / impedance** — fit with existing shape, layering, coupling
- **Observability / rollout** — feature flags, metrics, alerts, dashboards
- **Implementer-by-stack** (for SDKs/APIs): Node+jose, Python+cryptography, Go+x/crypto, Java+JCE, .NET — checks whether the artifact works in their world

## Design / product / UX lenses

- **Accessibility consultant** — WCAG, screen-reader paths, contrast, focus order
- **CRO / conversion specialist** — funnel, friction, drop-off points
- **Pricing psychologist** — anchors, framing, decoy effects
- **Design systems lead** — token usage, component drift, consistency
- **Information architecture** — hierarchy, discoverability, mental model
- **Editorial / copywriter** — voice, clarity, AI-tells, cuttable filler
- **Brand / visual hierarchy**
- **Onboarding / first-time experience**

## Docs / partner-facing lenses

- **Stripe-style docs reviewer** — do the examples copy-paste? are footguns called out?
- **Junior 3-YOE engineer** — could they ship from this doc?
- **Appsec reviewer** — does the doc leak unsafe defaults?
- **JSON Schema / contract correctness** — does the contract round-trip?

## Mixing across columns

Mix freely when the artifact straddles them. An external-facing API doc warrants a security architect, a Stripe-style docs reviewer, an editorial copywriter, and a junior engineer in the same wave. A consumer onboarding flow warrants accessibility, CRO, pricing psychology, design systems, and an editorial copywriter together.

The menu is a buffet, not a fixed cast. The right roles depend on the artifact — pick three to seven that actually have something to say about *this* work.

## Contrarian role

For high-stakes decisions, include a contrarian role by design — a "pragmatic veteran willing to disagree with the framing of the question", or one role briefed to *argue the OPPOSITE and explain why the locked decision is wrong*. Without it, panels drift toward consensus on whatever the prompt seeded.
