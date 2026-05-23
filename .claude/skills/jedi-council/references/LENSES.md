# Discipline lenses — a sampler

**This is a sampler, not a catalogue.** For a fintech review you might convene Regulatory / Fraud / Treasury / Audit. For a kids' game: Child-development / Parental-controls / Reading-level / Engagement. For a CLI: DX / Composability / Backwards-compat / Error-messages. The right lenses depend on what the artifact actually is — invent them, don't pick from a fixed list.

The constraint that matters: each role owns one lens no other role owns. "Senior engineer" is too broad. "Performance reviewer focused on cache key shape and TTL semantics" is the right granularity.

## Common engineering lenses

Pick the ones the artifact actually touches:

- Side-effects / blast radius (what fails if this is wrong)
- Backend correctness (semantics, ordering, edge cases)
- Performance (hot paths, N+1, caching, TTL semantics)
- Security / threat model
- Tests / test design
- Observability / on-call (what does failure look like at 3am?)
- Conventions / project idioms
- Architecture / impedance with existing shape

## Common product, design, UX lenses

- Information architecture (hierarchy, discoverability)
- Editorial / copywriter (voice, AI-tells, cuttable filler)
- Accessibility (WCAG, screen-reader paths, contrast)
- CRO / conversion (funnel, friction, drop-off)
- Pricing psychology (anchors, framing, decoy effects)
- Design systems (token usage, drift, consistency)
- Onboarding / first-time experience

## Common docs / partner-facing lenses

- Stripe-style docs reviewer (do examples copy-paste? footguns called out?)
- Junior 3-YOE engineer (could they ship from this?)
- Appsec reviewer (does it leak unsafe defaults?)

## The contrarian

For high-stakes decisions, brief one role to argue the opposite. "Argue the opposite and explain why the locked decision is wrong", or "the pragmatic veteran questioning whether this work needs to happen at all". Without an explicit contrarian, panels drift toward consensus on whatever the prompt seeded.

## Mixing across columns

The sections above are scaffolding, not categories. A partner-facing API doc wants a security architect + a Stripe-style docs reviewer + a junior engineer + an editorial copywriter — four lenses across three sections. Mix what the artifact actually touches.

## Cast sizes

Three is the floor; convergence is meaningless below that. Seven is comfortable. Ten is the ceiling for one round — past that, the synthesis cost outweighs the new signal.
