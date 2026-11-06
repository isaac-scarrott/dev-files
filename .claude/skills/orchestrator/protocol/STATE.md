# The state file

One file per orchestrated project: the owner's rules, what is in flight, what waits on the owner, what is queued. The [ledger](LEDGER.md) holds PR rows; this file holds everything around them. It holds current state, not history: overwrite lines in place and delete an item once it has landed.

## Location

`~/.claude/orchestrator-state/<project>/STATE.md`, beside that project's handoffs and reports. Durable output (reports, review tools, captures) goes in this folder, never in `/tmp`, which the OS clears.

## Keeping it current

The file earns its place only while it is true. Update it in the same step as the event, not at the end of the session:

- A builder is dispatched, finishes or is cut off: update **Building now**.
- The owner rules, or states a working rule: write it into **Rules** straight away (one place; briefs and handoffs point here, never copy).
- Something starts waiting on the owner, or stops: update **Waiting on the owner**.
- Before every report, reread the file: each line that disagrees with what you are about to say gets fixed, and each finished item deleted.
- After a context compaction or a restart, read this file first, then check each running builder's real state (`git status`, pushed head) before trusting a line.

## Template

```markdown
# <project>: state (synced <date>)

## Rules (owner)
- <one line each, dated; remove any the owner withdraws>

## Building now
- <work item> (<PR>), builder <session id>: <one line of where it is and what is next>

## Drafts for the owner
- <item, where to look (URL, path, harness setup), what to check>

## Waiting on the owner
- <decision or action, with what unblocks once it is done>

## Queued next / Later
- <item, and what must be known before it can be briefed>

## Verify (not yet proven)
- <claim, how to check it>

## With the merger (status only)
- <PRs whose baton is with the merger; never listed as the owner's task>

## Dropped
- <items the owner ruled out, so nobody revives them>

## Reference
- <builder session ids, Paper file ids, report paths>
```
