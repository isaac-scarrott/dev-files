# scheduler design

OpenCode 2.2.5 server plugin. Scheduled and recurring prompts that wake a session, modelled on Claude Code's cron tools.

## Decisions
- **Server only.** No GUI entry; the message carries `metadata.scheduledTask = { id, name, kind, scheduled, firedAt, lateMs, text }` so a GUI card can be added later the way orchestrator-tools reads `peerMessage`. `text` is the bare prompt, so the trailer never shows in a card.
- **Tools.** Namespace `scheduler`, effective ids `scheduler_<name>`, Code Mode `tools.scheduler.<name>`. All `codemode: true` with a loose object output schema, same as `orchestrate_*`. Errors reach the model as their message.
- **Wake.** `session.prompt` with delivery `steer`, always; no option anywhere in input, output or descriptions. The text is the wrapper from the brief plus a trailer: not typed by the user, only the session's own permissions, recurring tasks must not create recurring tasks unless asked, and, when late, how late. Name and body are XML-escaped (`& < >`, plus `"` in attributes) so neither can close the tag or forge another.
- **Storage.** One key, `state/v1`: `{ jobs, ended }`. `ended` keeps the last 20 removals with a reason (cancelled, ran once, reached maxRuns, target archived or deleted, delivery failed).
- **Targets.** `session` resolves like orchestrator-tools peers: self, parent, siblings, children, plus `scope` (`project`, `all`); ref (last 8 id chars), unique title, `title [ref]`, or a full id inside reach. The matching and `scope.ts` are copied, not imported, so the two packages stay independent. Sessions that orchestrator-tools created independently are not reachable unless in scope.

## Desktop row (`src/gui.tsx`, `src/message.ts`, `src/rpc.ts`, `src/control.ts`)

A run is shown as the shared injected-message row from `native-ui` (see [native-ui DESIGN](../native-ui/DESIGN.md)). Decisions (user, 2026-11-01): a user message is a scheduled run only when it carries `metadata.scheduledTask` (id, name, kind, text), so a typed look-alike stays the user's bubble. The card shows `metadata.scheduledTask.text`, the prompt exactly as written (no unescaping or wrapper parsing needed, and the model-facing wrapper and trailer are unchanged). Header: clock icon, task name, `scheduled run`. Cancel is offered for `every` and `cron` tasks that are still active (`rpc.ts`: `active({ ids })`, `cancel({ id, sessionID })`, answered from the shared hub, so any instance can); a one-off has nothing to cancel. `cancel` checks the task wakes the calling row's session. A missing server half means no button.

## Composer chip (`src/gui.tsx`, `src/chip.ts`, `src/rpc.ts` `pending`, `src/control.ts`)

A "N schedules" chip in the row above the composer, from `native-ui`'s `createSessionChip` (design, host facts, motion, the Hidden setting and measurements in [native-ui DESIGN](../native-ui/DESIGN.md#composer-chips-chip-motionts-lane-chipts-lane-chip-rowstsx-session-chiptsx-chip-timets)). Decisions (user, 2026-11-02):

- **Scope: aimed at the session on screen.** `pending({ sessionID })` answers the tasks whose `sessionID` is that session, whoever scheduled them: `id`, `name`, `kind`, `spec` (the schedule as written), `paused`, `nextRun`, `runs`, `maxRuns`. Never the prompt. The scheduler is one process-wide hub, so any instance answers for every session; the call still carries the session's `location` like the others.
- **Row text.** Name, then `every 2h · next in 1h 47m · 2 of 6 runs` (`scheduleStatus`): the schedule as written (`once` for a one-off), the next run or `paused`, and runs so far against `maxRuns` for repeating tasks. A one-off is listed until it has run, and can be cancelled before.
- **Cancel** reuses `cancel({ id, sessionID })`, which refuses a session that is not the task's own.
- **Icon:** the clock. The pill API takes catalog icons only; see the placeholder in native-ui DESIGN.
- **No navigation:** a task wakes the session on screen by definition, so there is no other target to open.

## Time
- **cron** is 5 fields (lists, ranges, steps, month/day names, `@daily`-style aliases), evaluated in the process's local zone. When both day fields are restricted a day matches if either does (Vixie). The search walks wall-clock fields through UTC arithmetic and converts each candidate with `new Date(y, m, d, h, min)`: a wall time inside a spring-forward gap fires once, at the instant the clock lands after the gap; a wall time repeated by a fall-back fires once, at its first occurrence. Consequence: an hourly job skips the repeated hour rather than firing twice in it. Day 31 skips short months; `0 0 31 2 *` is rejected as never matching.
- **at** takes ISO (no zone means local; a bare date is rejected) or `+30m`, `in 2h`. **every** takes `30m`, `1h30m`, `1d` or a number of minutes.
- **Ticking.** One timer re-armed after every tick and every change to fire at the earliest due time or after `tickSeconds`, whichever is sooner. A timer that slept with the machine fires on wake, so catch-up is immediate. At startup the first tick catches up too.
- **Missed runs fire once.** A due job fires once whatever the number of missed slots; recurring jobs then reschedule from now (`every`: now + interval; `cron`: next slot after now). `scheduled=` keeps the slot that was missed.
- **Crash safety.** State is saved before the prompt is sent, so a crash between the two skips a run rather than repeating it. A failed prompt restores the job and retries in a minute; three failures in a row drop it.

## One scheduler per process, and exactly-once delivery
The server loads the plugin once per project location, in one process over one shared storage. Instances try to share one scheduler (module-level, ref-counted; the last one out clears the timer), but that sharing is not reliable. Incident, Mon 2 Nov 2026: `sch_eba13d5a` (cron `25 9 * * 1`) woke its session six times at 09:25:00.03-.05Z with the same `scheduled=`. `scheduler.log` shows `loaded:` six times per service start (the module-level singleton is meant to log it once), so each instance had its own module copy, scheduler, in-memory state and timer, all reading the same stored job; the 09:00 catch-up had double-fired `sch_7134bae0` the same way. Nothing deduplicated the delivery.

Decisions (2026-11-02):
- **Claim before send.** Each due job is claimed under the key `<id>@<scheduled slot>` before anything is saved or sent; a loser does nothing. The claim is `O_EXCL` file creation under `<logDir>/claims/` (atomic across instances, processes and restarts), behind a synchronous process-wide map on `globalThis[Symbol.for(...)]` so even a second module copy shares it. Host storage has no compare-and-set, so it cannot be the gate. Claim files are pruned after 30 days. If the directory cannot be written, the in-process claim still holds (logged).
- **Reread state.** Instances each hold a copy of `{ jobs, ended }` and save the whole of it. `add`, `cancel` and `tick` reread storage first, and a claim winner rereads again and checks the job still has that slot before firing, so a stale copy neither refires nor overwrites another instance's progress. A residual race remains between concurrent `add`s from different instances (last save wins); not seen, and each rereads first.
- **Crash between claim and save.** The claimed slot is skipped, never repeated (same rule as save-before-send). If the stored job is still on that slot more than 60 s after the claim, its claimant died; the next tick advances the job past the slot without sending, so it does not stay stuck.
- **Any instance delivers.** Not only the one whose location owns the target session: any live host reaches every session, and ownership would add a way for a job to never fire when that location is gone. The claim makes who delivers irrelevant.
- **Timers.** Disposing the last instance clears the timer, and a timer callback that fires after that does nothing (tested).
- **Late runs.** A job overdue after sleep or downtime runs once, however many slots passed, and then reschedules from now; `scheduled=` keeps the first missed slot. Missed cron ticks are never replayed.

## Safety
Wrapper only, as chosen, plus options with generous defaults: `maxSchedules` 50, `minIntervalSeconds` 60 (checked for cron by comparing two consecutive slots), per-job `maxRuns`, and a loop guard (more than `loopMaxFires` fires in `loopWindowMinutes` pauses the job and posts a non-waking notice via `session.synthetic`; a paused job stays in `list_schedules` until cancelled). Prompts are capped at 20,000 characters and never logged; log lines go to stderr and `scheduler.log`, rotated at 1 MB, like usage-resume.

## Not built
- **Usage limits.** The brief asked not to wake while usage-resume reports the accounts limited if cheaply knowable. It is not: usage-resume keeps its readings in its own storage namespace and its waiting list per project location, and exposes only an RPC for its composer toggle. A wake into a limited session just fails its run, like any prompt, and usage-resume's opt-in handling applies if the session enabled it. Revisit if usage-resume exposes a "limited until" read.
- **Pause/resume tool.** A paused job is cancelled and recreated.
- **Per-session listing.** `list_schedules` shows every task; the user is one person and the list is short.
- **Dedicated wake without a running server.** Nothing fires while the server is stopped; missed runs fire on the next start.

## Performance
The chip adds nothing at idle and two requests per message change; table in [native-ui DESIGN](../native-ui/DESIGN.md#composer-chips-harness-225-monitor--scheduler-loaded-a-session-with-a-running-subagent-a-monitor-and-a-schedule). The `gui-experimental.cjs` bundle grew from 17.3 kB to 28.4 kB.
