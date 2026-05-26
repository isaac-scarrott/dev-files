# Panel mechanics (shared)

Both `jedi-council` and `the-focus-group` use this pattern. The skills differ in *stance* (third-person discipline analysis vs first-person lived friction); the mechanics below are identical.

## The load-bearing principles

These aren't a checklist — they're what makes a panel actually work. Break one and the rest falls.

**Independence.** Three lenses that all react to the same baked-in framing are one voice in three hats, not three independent voices. The cast is only as strong as its actually-distinct angles. If two roles could be the same person, one of them isn't earning its slot.

**Parallel dispatch.** All sub-agents in a single message via the Agent tool (`subagent_type: general-purpose`). Sequential dispatches let each agent see the previous one's output and the panel collapses to consensus. Parallel preserves independence.

If the Agent tool is unavailable in the current environment, stop and tell the user. Silently role-playing the panel in-context defeats the purpose — explicitly flagged as a failure mode.

**Honest synthesis.** Convergence is meaningful only if the lenses were independent. A 3/5 finding on a baked-in premise is one finding three voices repeated. A 1/5 finding from the only lens scoped to catch it can be load-bearing — flag sole-owner findings and don't dismiss them on count alone.

**Cast for the artifact, not for the form.** Small artifact, small panel. High-stakes artifact, broader panel, maybe a contrarian. Trust your judgement — there is no minimum cast size that has to be met. If two lenses surface what's needed, two is enough. If the artifact is small enough to answer in a paragraph without a panel at all, do that. Refusing to convene is a first-class outcome; the skill exists to surface what you couldn't otherwise see, not to add ceremony to what you already see clearly.

**The user decides.** The panel surfaces; recommendations aren't decisions. End the synthesis with a question to the user about which action to apply. Use AskUserQuestion for concrete picks (flag your recommended option first, suffix with "(Recommended)"). Use a short freeform grill when the right call needs context only the user has.

## Round 2

Rare. Only when round 1 produced a concrete fact-shaped dispute that another round can resolve. Round 2 prompts must thread the prior round back — each reviewer reacts to the others' positions, doesn't restate.

If round 1 produced *two visions* (Path A vs Path B), don't debate them in round 2 — pick one and ship, or take it to the user. Round 2 between visions guarantees both get steelmanned at length, which is exactly the balloon.

Stop at round 2. Round 3 is noise.

## Failure modes

The principles inverted. Watch for these in your own panel:

- **Convergence-but-wrong.** The panel agrees on a flawed premise the prompts baked in. Classic shape: a pre-locked option set. Mitigate by leaving options open and briefing one contrarian on high-stakes calls.
- **Sequential collapse.** Agents see prior output and converge. One voice in many hats.
- **Job-title lenses.** "Senior engineer" is too broad to be its own lens. "Performance reviewer focused on cache-key shape and TTL semantics" is right.
- **Self-fulfilling rigor.** Demanding a "prod-break mode" for an artifact that has none manufactures stakes. So does forcing a synthesis structure heavier than the artifact deserves. Match the rigor to what the artifact actually is.
- **Round inflation.** Past round 2 is noise. Two visions in round 1 don't justify round 2; they justify a decision.
- **Recipe over judgement.** Mechanically reaching for a panel because the skill is available, instead of asking "does this artifact warrant one?". Small artifacts get answered without one.
- **Structure swallowing substance.** A clean table without prose is a checklist; the prose around it carries the verdict. Use whatever shape fits the artifact.
