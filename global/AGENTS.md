# AGENTS.md

Cross-tool guidelines (Claude Code, opencode, others). Modern harnesses already enforce simplicity, surgical diffs, and concise output — these are the deltas on top. Merge with project-specific instructions.

## Acting vs asking

- Default to acting. State assumptions inline and proceed; don't stop to ask about choices resolvable from the request, the code, or sensible defaults.
- Ask only when the answer changes what gets built: genuine scope ambiguity, a destructive or irreversible action, or input only the user has.
- Don't quietly retire a known-wrong thing by calling it "low-value" or "out of scope" — fix it, or surface it and ask.

## Verification

- Turn tasks into verifiable goals before coding: "fix the bug" → "write a test that reproduces it, then make it pass".
- For bugs, find what *allowed* the failure, not just where it surfaced. Fix the root cause when that stays in scope; if it would mean a larger refactor, surface that instead of papering over the symptom.
- After changes, run the narrowest relevant validation (typecheck, lint, related tests) and report actual results. Never claim green without having seen the output.

## Long-running commands

- The shared OpenCode server restarts several times a day, and a restart kills shell jobs, foreground and background. Anything likely to run past ~2 minutes (installs, full test suites, harness runs, CI or deploy waits) goes through `monitor.start` when that tool is available (it is often a Code Mode tool: `await tools.monitor.start({...})` inside `execute`), never a foreground or sleep-polled shell: it wakes you when the command exits, and after a restart it runs the command again from the start. So make it safe to rerun: write its log to a file, skip work already done, and never clear state another live process may still be using.

## Sub-agent tiers

Every sub-agent dispatch goes to the cheapest tier that can finish it: orchestrator builders, project-runbook items, merger resolvers, grilling fact-finds, Explore passes, any fan-out. Planning, specs, grilling the user, review and landing stay in the dispatching session, which reads what comes back before acting on it.

| Tier | Gets | Runs on |
|---|---|---|
| **scout** | finding code, research, root-cause traces, CI, deploy and monitoring log triage, "what changed", read-only queries, summarising long output | a cheap model, read-only |
| **worker** | one scoped change with a written acceptance check: mechanical edits, renames, generated-file conflicts, tests, fixtures, docs, small single-area fixes | a cheap model; commits, never pushes |
| **builder** | feature code across several files, design and visual work (screenshots, mocks), source conflicts, money, auth, data or migrations | the strong model |

- Each harness maps the tiers in its own config. Dispatch to the agent named after the tier when one exists; otherwise set the dispatch's model to the cheapest one the harness offers for scout and worker.
- Brief a scout or worker tightly: the files or area, the acceptance check, a word budget for the report. Work that can't be briefed that tightly is builder work.
- **Escalate** to the builder tier, passing on what was found, when a scout or worker fails its check twice, loops, or stubs the hard part. On a quota or rate-limit error, retry the same tier on another cheap model first.

## Artifacts

- Put meaning in the artifact itself: clear names, plain structure, direct words. If it reads unclearly, fix the artifact — don't paper over it with an explanation.
- A comment or note must carry a non-obvious *why* the artifact can't express; if it restates what's already there, cut it.
- Absence speaks for itself. When asked to remove something or stop doing something, the deletion is the whole change — don't add a comment marking what was removed, a guard or fallback for the now-absent case, or text stating the negation. If absence already implies it, don't say it.

## Reporting

- When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.

## Token budget guards

- At **90%** of the 5-hour or weekly token allowance: warn me, then wind down to a good stopping point — finish the current unit of work, don't start new tasks or fan out sub-agents.
- You cannot query remaining quota directly — treat any usage signal as authoritative: harness/API rate-limit warnings, `/usage` output I share, 429 errors, or me mentioning limits.
- Before stopping, snapshot state (done/pending, exact next steps) to `~/.claude/token-guard/snapshot-<YYYY-MM-DD-HHMM>.md` and tell me when to resume.

## AWS credentials

- If AWS credentials are expired/missing, refresh them yourself with `aws sso login` (e.g. `aws sso login --profile holibob` on Holibob work) — don't stop to ask me.
