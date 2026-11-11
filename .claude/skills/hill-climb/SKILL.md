---
name: hill-climb
description: Improve something measurable by repeated small changes, each kept only if it beats a fixed score by more than its noise. Use for tuning a pipeline, prompt, solver, model choice, UI (typography, spacing, layout), performance, or ranking/selection quality, and when asked to "hill climb", "iterate until it passes", "optimise against the eval" or resume a climb.
---

A **climb** is only as good as its **yardstick**: the inputs it runs on, the answer key or judge it is scored by, and the bars it must clear. Score changes mean something only while the yardstick holds still and the change beats the noise. So the climb is two phases. Build and freeze the yardstick first, then climb against it. Most lost time in past climbs came from skipping the first phase: tuning against inputs that were broken, or against a key and bars that moved mid-climb so no gain could be credited.

## Phase 1: build the yardstick (no tuning yet)

1. **Name the target.** State one primary score and its bar, the constraints that must not regress (cost, latency, size, accessibility), and the budget in money and wall time. *Done when* the user has agreed them in writing.
2. **Validate the inputs.** Smoke-check the data the system runs on before anything is scored: fields actually populated (sample real rows, don't read the schema), text not truncated, units and categories right, the same shape the production path sees. For UI, check the real component renders the real content, not a mock. *Done when* each check has a number from a sample, and every defect is fixed or written down as accepted.
3. **Build the key or judge, then test the key.** Measure how often independent labellers or judges agree with each other. That agreement is the ceiling, so no bar above it is reachable. Check that every test case has one right answer; drop or pin the ambiguous ones. Split train from test with no near-duplicates leaking across.
4. **Measure the noise floor.** Run the unchanged system enough times to see how far its score moves on its own. A change counts only when it beats that noise.
5. **Freeze it.** Record the input snapshot, key version, scorer version, bars and noise floor in the climb's log. *Done when* the frozen baseline score is recorded against that exact yardstick.

## Phase 2: climb

6. **One change per round,** with a stated hypothesis. Run it, score it against the frozen yardstick, then keep it only if it beats the noise floor and breaks no constraint. Otherwise revert it. Log the change, scores, cost and keep/revert decision every round.
7. **A yardstick change restarts the climb.** If the inputs, key, scorer or bars must change, stop, re-freeze, and re-score the current best and the baseline before the next round. Never compare scores across yardsticks.
8. **Two flat rounds mean re-diagnose.** After two rounds that don't beat the noise, stop tweaking and look for a root cause in the system or the yardstick (a transposed matrix, a field never read, a wrong rule). The biggest jumps come from those, not from a third variant of the same idea.
9. **Stop** at the bar, at the budget, or when the next round costs more than it could gain. Report the final score with its noise, the kept changes, and what was tried and rejected.

## Running rounds

- Each round runs in a dispatched agent with a tight brief: the one change, the frozen yardstick's paths, and the score command.
- Score runs go through `monitor.start` (Code Mode: `await tools.monitor.start({...})`). End the turn after starting one; the monitor wakes you.
- An agent's edits count only once they're scored. If a round ends at a step limit or a crash with an unscored edit, revert it before the next round.
