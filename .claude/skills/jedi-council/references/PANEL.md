# Panel mechanics (shared)

Both `jedi-council` and `the-focus-group` use this dispatch pattern. The skills differ in *stance* (third-person discipline analysis vs first-person lived friction); the mechanics below are identical.

## Dispatch in parallel

All sub-agents in a single message via the Agent tool (`subagent_type: general-purpose`). Parallel matters — sequential dispatches let each agent see the previous one's output and the panel collapses to one voice in many hats.

If the Agent or Task tool is unavailable in the current environment (sub-agents sometimes don't have it), stop and tell the user. Silently role-playing the panel in-context defeats the entire purpose of parallel dispatch, and the user has explicitly warned against it as a failure mode.

## Convergence counting

A 1/N finding is not weak when only one lens could have caught it. If the performance reviewer is the only role scoped to spot an N+1, silence from the others is not signal. Flag sole-owner findings and treat them as load-bearing.

A high convergence count is meaningful only if the lenses are genuinely independent. Three lenses on the same shared context can converge for the same reason, which is one reason in three voices, not three independent reasons.

## Round 2

Only when a concrete dispute remains after round 1. Round 2 prompts must thread the prior round back — give each reviewer the others' positions and ask them to react, not restate.

Stop at round 2. Round 1 finds problems; round 2 verifies fixes; round 3 is noise.

## Closing the loop

Recommendations are not decisions. End the synthesis by asking the user which action to apply.

Use AskUserQuestion when the choices are concrete picks the user can rank between (flag the option you'd recommend as the first option, suffix with "(Recommended)"). Use a short freeform grill (in the spirit of `/grill-me`) when the right call needs context only the user has.

The panel surfaces; the user decides.

## Common failure modes

- **Convergence-but-wrong.** Panel agrees on a flawed premise the prompts baked in (classic shape: pre-locked option set). Mitigate by leaving options open.
- **Round inflation.** Stop at round 2.
- **Structure swallowing substance.** A clean table without prose is a checklist; the prose around it carries the verdict.
