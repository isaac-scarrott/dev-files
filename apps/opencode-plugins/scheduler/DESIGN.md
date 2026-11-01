# scheduler design

OpenCode 2.2.5 server plugin. Scheduled and recurring prompts that wake a session, modelled on Claude Code's cron tools.

## Decisions
- **Server only.** No GUI entry; the message carries `metadata.scheduledTask = { id, name, kind, scheduled, firedAt, lateMs, text }` so a GUI card can be added later the way orchestrator-tools reads `peerMessage`. `text` is the bare prompt, so the trailer never shows in a card.
- **Tools.** Namespace `scheduler`, effective ids `scheduler_<name>`, Code Mode `tools.scheduler.<name>`. All `codemode: true` with a loose object output schema, same as `orchestrate_*`. Errors reach the model as their message.
- **Wake.** `session.prompt` with delivery `steer`, always; no option anywhere in input, output or descriptions. The text is the wrapper from the brief plus a trailer: not typed by the user, only the session's own permissions, recurring tasks must not create recurring tasks unless asked, and, when late, how late. Name and body are XML-escaped (`& < >`, plus `"` in attributes) so neither can close the tag or forge another.
- **Storage.** One key, `state/v1`: `{ jobs, ended }`. `ended` keeps the last 20 removals with a reason (cancelled, ran once, reached maxRuns, target archived or deleted, delivery failed).
- **Targets.** `session` resolves like orchestrator-tools peers: self, parent, siblings, children, plus `scope` (`project`, `all`); ref (last 8 id chars), unique title, `title [ref]`, or a full id inside reach. The matching and `scope.ts` are copied, not imported, so the two packages stay independent. Sessions that orchestrator-tools created independently are not reachable unless in scope.

## Time
- **cron** is 5 fields (lists, ranges, steps, month/day names, `@daily`-style aliases), evaluated in the process's local zone. When both day fields are restricted a day matches if either does (Vixie). The search walks wall-clock fields through UTC arithmetic and converts each candidate with `new Date(y, m, d, h, min)`: a wall time inside a spring-forward gap fires once, at the instant the clock lands after the gap; a wall time repeated by a fall-back fires once, at its first occurrence. Consequence: an hourly job skips the repeated hour rather than firing twice in it. Day 31 skips short months; `0 0 31 2 *` is rejected as never matching.
- **at** takes ISO (no zone means local; a bare date is rejected) or `+30m`, `in 2h`. **every** takes `30m`, `1h30m`, `1d` or a number of minutes.
- **Ticking.** One timer re-armed after every tick and every change to fire at the earliest due time or after `tickSeconds`, whichever is sooner. A timer that slept with the machine fires on wake, so catch-up is immediate. At startup the first tick catches up too.
- **Missed runs fire once.** A due job fires once whatever the number of missed slots; recurring jobs then reschedule from now (`every`: now + interval; `cron`: next slot after now). `scheduled=` keeps the slot that was missed.
- **Crash safety.** State is saved before the prompt is sent, so a crash between the two skips a run rather than repeating it. A failed prompt restores the job and retries in a minute; three failures in a row drop it.

## One scheduler per process
The server loads the plugin once per project location, in one process over one shared storage. Each instance would tick and fire the same jobs, so instances share one scheduler (module-level, ref-counted); any live instance's host drives the session calls and the last one out stops the timer. Verified live: "loaded" logs once. Two server processes over one database are not guarded against (found when a hand-started second service fired a late job twice); OpenCode does not run that setup.

## Safety
Wrapper only, as chosen, plus options with generous defaults: `maxSchedules` 50, `minIntervalSeconds` 60 (checked for cron by comparing two consecutive slots), per-job `maxRuns`, and a loop guard (more than `loopMaxFires` fires in `loopWindowMinutes` pauses the job and posts a non-waking notice via `session.synthetic`; a paused job stays in `list_schedules` until cancelled). Prompts are capped at 20,000 characters and never logged; log lines go to stderr and `scheduler.log`, rotated at 1 MB, like usage-resume.

## Not built
- **Usage limits.** The brief asked not to wake while usage-resume reports the accounts limited if cheaply knowable. It is not: usage-resume keeps its readings in its own storage namespace and its waiting list per project location, and exposes only an RPC for its composer toggle. A wake into a limited session just fails its run, like any prompt, and usage-resume's opt-in handling applies if the session enabled it. Revisit if usage-resume exposes a "limited until" read.
- **Pause/resume tool.** A paused job is cancelled and recreated.
- **Per-session listing.** `list_schedules` shows every task; the user is one person and the list is short.
- **Dedicated wake without a running server.** Nothing fires while the server is stopped; missed runs fire on the next start.
