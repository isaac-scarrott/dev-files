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
