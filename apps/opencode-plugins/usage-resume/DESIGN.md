# usage-resume: design

Server plugin for OpenCode Desktop 2.2.5. When a session stops because a Claude usage limit was reached, it works out
when usage is available again and resumes that session then, across all the cliproxy Claude accounts.

## Evidence

### How a limit surfaces

The Claude route is the **Claude Agent provider**: OpenCode spawns the `claude` CLI, which talks to cliproxy
(`claude-proxy` copies the proxy env in). Read from the bundled `opencode-cli` 2.2.5 (function `ZU`, the CLI-event to
error mapper):

- A `rate_limit_event` with `rate_limit_info.status === "rejected"` is remembered (`rateLimitType`, `resetsAt` in epoch
  seconds). An assistant message with `error === "rate_limit"`, or a rejected event plus HTTP 429, marks a limit.
- The thrown `Error` message is the CLI's own result text, or `Claude Code subscription limit reached (<type>).` when that
  is empty, then ` Resets at <ISO-8601>.` when the event had `resetsAt`, then ` Check your Claude plan and extra-usage
  settings.` for `billing_error`. `<type>` is `rateLimitType` with `_` as space: `five hour`, `seven day`, `overage`, …
- It is a plain `Error`, so the session error is `{ type, message }` with no status, body or `retryAfterMs`. The reset
  time is only in the message. A bare 429 (no rejected event) has no reset time.
- The app's own `provider.free-limit` / `go-limit` / `budget-limit` types are OpenCode Zen/Go/Console limits. They carry
  `retryAfterMs` or `resetsAt` and are not Claude accounts, so they are ignored.
- CLIProxyAPI says "All credentials for model claude-… are cooling down" when every account is out for that model. OpenCode
  rethrows it as `{ type: "provider.rate-limit", message }` with the status and body stripped (observed in the harness and
  in `unmatched-limit-like-error.json`), so its `reset_seconds` / `Retry-After` never arrives. It is a wall for the same
  reason a 5-hour limit is, but the only honest schedule is the usage endpoint.

The detector therefore matches the message text, and also a 429 whose body mentions a limit or a `resets_at`, and uses
`retryAfterMs` as a last resort for the reset time. A reset more than 8 days away is treated as a misparse.
`detectProviderCooldown` handles the cooldown separately, and only after a run has failed: the retry hook would otherwise
end OpenCode's own short retry of a 429 that may clear in seconds.
Not parsed: the CLI's free text ("resets 2pm (Europe/London)"). The provider appends the ISO time whenever it knows it,
and the usage endpoint covers the rest.

### Events and hooks used (plugin SDK 2.2.5)

- `ctx.event.subscribe`: `session.execution.failed` (`data.error`, event `created`) marks the stall.
  `session.execution.started | succeeded | interrupted`, `session.deleted` and `session.inbox.enqueued` with
  `item.type === "user"` mean someone else moved the session on.
- `ctx.session.hook("retry")` with `decision = { retry: false }` for a usage limit. Without it OpenCode retries with short
  backoff for a condition that lasts hours; with it the run ends and the stall event fires.
- `ctx.session.get` for `outcome`, `time.busy|idle|archived`, `parentID`.
- `ctx.session.prompt({ sessionID, text, delivery: "queue" })` to resume. Queue delivery waits behind anything the session
  is doing and never steers a running turn.
- `ctx.session.synthetic({ ..., description, resume: false })` for the "Resumes at 14:05" notice. A synthetic item with a
  description renders in the timeline, and `resume: false` keeps it from waking the session. There is no server-side toast
  API (`ctx.toast` is GUI-only), and a timeline notice sits in the session it is about. The GUI part (v2) is only the opt-in toggle and setting, below.
- `ctx.storage` for state.

Not verifiable here: no real limit can be triggered in the harness, so the exact error shape rests on the binary's
source above and the unit tests simulate it (see Verification).

### Source of truth for "available again"

`GET api.anthropic.com/api/oauth/usage` per account, the same endpoint, headers and accounts as `apps/notch-usage`:
`~/.cli-proxy-api/claude-*.json`, skipping `disabled`, tokens read fresh each refresh (cliproxy rewrites them), never
logged or stored. Each account returns `five_hour` and `seven_day` with `utilization` (percent) and `resets_at`.

cliproxy round-robins across accounts and fails over on 429, so a stalled session can run as soon as **any** account has
both windows below 100%. An account that is exhausted in several windows is back only when the last of them resets. So:

> available at = min over accounts of (max over that account's exhausted windows of `resets_at`)

The reset time parsed from the error is a second candidate (the earliest of the two wins), and the only one when no
account data can be read. For `overage` rejections the windows do not describe the limit, so only the error's reset counts.

**Polling budget.** The endpoint rate-limits hard. The same rules as the notch app: an account is fetched only when its
newest reading is at least 5 minutes old and its own backoff has passed; a 429 or 401/403 backs off 5, 10, 20, 30
minutes (honouring `Retry-After`); other failures retry after 1 minute; 0-20 s jitter. Readings and schedules persist.
If the notch app's snapshot (`~/Library/Caches/NotchUsage/snapshot.json`) has a newer reading, that is used instead of
fetching, so running both does not double the load. The plugin never fetches faster than the notch app would.

**Margin and re-verify.** The check runs `marginSeconds` (default 60) after the computed reset. It then needs a reading
taken after the stall that shows an account with both windows under 100%. If it still shows 100% (the window moved) the
session is rescheduled to the new reset. A reading that says "exhausted" with a reset already in the past is stale and
triggers a refresh at the next allowed poll. If the error's reset has passed and usage can still not be read (offline,
signed out) for two checks in a row, it resumes anyway on the reset time alone (the attempt cap bounds the damage).

**Extra usage.** The plugin never enables or pays for extra usage and does not read `extra_usage`. A window at 100% is
limited whether or not the account has extra usage on, except that an `overage` rejection waits for the error's reset.
Note the interaction with the cliproxy overage problem (extra-usage-guard research): this plugin only resumes work when a
subscription window has reset, so it does not make overage spending more likely.

## Opt-in (v2)

Auto-resume is **off by default** and needs a human opt-in, at two levels:

1. **Per session**: a `ComposerPill` above the composer, shown **only while the session is stopped at a usage limit**
   (see "The composer pill"). Clicking it turns auto-resume on or off for that session. Sessions without a choice are off.
2. **Global default**: a switch "Auto-resume after usage limit" in Settings > Preferences > General, off by default.
   On means a session starts with its toggle on when it is **created** (`session.created`, root sessions only). It is
   not retroactive: a session that already exists keeps what it had, and turning the default off later leaves sessions
   already created as they are. The session's own toggle always overrides the default.

The server plugin checks the toggle when a limit is detected, again right before resuming (so switching it off while
waiting stops the resume), and in the `retry` hook: an opted-out session keeps OpenCode's own retry behaviour.

### The composer pill

The toggle used to be an `IconButton` injected into the composer controls row by a body-wide `MutationObserver`. It
looked detached (the host shows the reasoning-effort control there only on hover, leaving our button alone) and was
visible all the time. It is now a `ComposerPill`, the host's registry for status capsules in the row above the composer
beside the background-work and todo pills: host spacing, tones and hover states, no DOM injection, no observer, no
`resize` listener, and no pill in a subagent's session (which matches "never subagents").

Visibility rule, evaluated by the host's reactive `show`: the pill exists only while the server reports the session as
`limited`. The server marks a session limited when a run fails on a usage limit (whether or not it opted in, which is why
the state is kept apart from `waiting`) and clears it on any event that moves the session on (a run starts or ends, a
user message, deletion). A stated reset time that has passed also ends it, since an opted-out session has nothing else to
clear it.

Two details found in the harness. OpenCode retries an opted-out session for minutes before the run fails, so the `retry`
hook also marks the session limited (it still lets OpenCode retry). And the GUI asks whichever location's instance
answers, while only the owning instance saw the failure, so the mark is mirrored to shared storage (`limited/<id>`, with
the next check time) and `get` reads it there. For the same reason the owner learns of a toggle change by reconciling
waiting with the toggles on each tick (and at once when the call happens to reach it), so a session opted in while
limited starts waiting within one tick (30 s by default).

States: limited and off is a warning pill "Resume after limit" (click opts in and starts the wait at once); limited and
on is a success pill "Resuming 14:05" (click opts out); a failed read is a danger pill "Auto-resume unavailable". The
pill has no `pressed` state, so on and off are told apart by label and tone. Gap: `ComposerPill` has no hover-reveal
rule of its own; it is simply absent when not limited.

### Where the state lives

GUI and server are separate processes. The server plugin owns the state in `ctx.storage` (`toggle/default`,
`toggle/session/<id>`) and the GUI reads and writes it over the plugin's RPC (`src/rpc.ts`: `get`, `set`, `getDefault`,
`setDefault`, and a `changed` event so every window re-reads). Session metadata was rejected: the GUI has no write path to
it, and storage keeps the toggle out of exported sessions. A draft composer (no session yet) shows no pill; the default
applies when the session is created.

### One instance per project location

Measured in the harness: the server loads this plugin once per project location (3 instances for 3 locations), all in
one process, over **one shared storage**, and every instance's `event.subscribe` hears every session's events. Left
alone that resumes a session once per location and polls the usage endpoint once per location. So:

- an instance acts only on sessions whose `location.directory` equals its own; the rest are ignored silently;
- waiting/attempt state is keyed per location (`state/v2/<hash of directory>`);
- the usage readings, backoff schedules and the in-flight refresh are one shared object (`src/hub.ts`) persisted under
  `usage/v1`, so the 5-minute floor holds however many locations are open;
- the toggle state is shared storage and needs no ownership.

### Diagnostics

The plugin API has no logger, and the service's stderr is not kept anywhere readable (checked in the harness), so every
line goes to stderr **and** to `<sampleDir>/usage-resume.log` (default `$XDG_DATA_HOME/opencode/usage-resume/`,
`~/.local/share/opencode/usage-resume/`), rotated once at 1 MB. It logs: startup (location, default, waiting count),
every failed run (type, status, redacted message), every detected limit (kind, resetsAt), every schedule, every
"not yet available" re-check, every resume, and every skip with its reason (`toggle off`, `subagent`, `archived`,
`attempt cap`, `touched since the stall`, …). Tokens, bearer values, JWTs and key-like blobs are redacted from log lines
and samples.

Samples: the first detected limit error is written to `limit-error.json`, and the first error that **reads** like a limit
(`limit|quota|usage|429|rate limit|exhausted|resets|overage|billing`) but did not match the detector to
`unmatched-limit-like-error.json`. Neither is overwritten. They are real provider text for future detector tests.

### Known gap: a limit that never fails

On the night this was specified, all accounts hit their window limits and the v1 plugin did nothing: it loaded but logged
nothing, and work did not stop. Most likely a run **never failed**: an account with extra usage on (the holibob Max 20x)
keeps serving past 100% and bills the overage, so no limit error reaches OpenCode and there is nothing to detect. This
plugin reacts to a failed run; it cannot see a window being exceeded while requests keep succeeding, and it must not
enable or pay for extra usage. The new log shows whether that is what happened (no `run failed` lines at all while usage
was at 100%), and `unmatched-limit-like-error.json` catches the other possibility, that the error text differs from what
the detector expects.

## Decisions (defaults)

| Decision | Default | Option |
|---|---|---|
| Which sessions | **opt-in only.** A session is resumed only when its own toggle is on. Subagent sessions (with a parent) are never resumed and have no toggle: the parent decides what to do with a failed child | |
| Prompt | `Continue.`, queued | `prompt` |
| One resume per stall | the stall is forgotten before the prompt is sent; a new stall needs a new failure | |
| Loop cap | 3 resumes per session, counted until the session completes a run; the Nth+1 failure posts a notice and stops | `maxAttempts` |
| Backoff | a repeat stall waits an extra 5 min, then 10, 20 … | `retryBackoffSeconds` |
| User intervened | any user message, new run, interrupt or delete cancels the wait; at resume time the session must still be idle, not archived, `outcome` failed, and not run since the stall | |
| Give up | stalls older than 8 days are dropped | `maxWaitHours` |
| Status | a timeline notice "Claude usage limit reached. Resumes automatically at 14:05." (re-posted if the time moves later by 5+ min, at most 3 times). The resume itself shows as the `Continue.` message | `notices` |
| Persistence | `ctx.storage` key `state/v1`: waiting sessions, attempts, usage readings and schedules | |
| Sleep | no long timer. A 30 s tick compares the wall clock to each session's `dueAt`, so the first tick after wake does everything overdue, and the usage re-check runs then | `tickSeconds` |
| Several sessions | resumed one after another, 1 s apart | `staggerSeconds` |

## Layout

- `src/detect.ts`: pure; error to `{ kind, resetsAt }`.
- `src/usage.ts`: accounts, polling with floor/backoff, snapshot reuse, pure `availability`.
- `src/plan.ts`: pure `decide` (resume or when to look again).
- `src/resume.ts`: `Resumer`, the state machine behind a small `Host` interface.
- `src/server.ts`: wiring: events, retry hook, tick, rpc.
- `src/toggles.ts`: opt-in state (default and per session). `src/rpc.ts`: the GUI/server contract.
- `src/hub.ts`: the usage source shared by every location's instance. `src/diag.ts`: log file, redaction, samples.
- `src/gui.tsx`: the composer pill and the Settings row. `src/view.ts`: pure `pillFor`, what the pill shows.

## Known limits

- A stall that happened while the plugin was not loaded (or the desktop app was quit) is not found afterwards; only
  stalls seen live and persisted are resumed.
- If the app is quit while sessions wait, nothing resumes until it is reopened; then overdue sessions resume on the first tick.
- The error shape was read from the binary, not observed live. If a bare 429 carries no limit text it is not treated as a
  usage limit (it is usually a short rate limit that OpenCode already retries).

## Decisions: DOM hooks

- **The composer toggle** is DOM injected into the composer row by a body-wide observer (`src/gui.tsx`, `src/composer.ts`). `ComposerPill` is the official capsule near the composer and would replace it, but it sits above the row rather than after the model picker. Which placement wins is the user's call (a `ComposerPill` spike is queued).
- **Server side** uses public hooks (`SettingsPage`, RPC, session hooks) only.

## Performance

Not measured yet. Method and bars: [performance.md](../.claude/skills/opencode-gui-plugins/reference/performance.md) (seeded 500-prompt session, bare vs plugin, three runs, median). Fill the table below when measured.

Standing cost, read from the source (not measured):
- A body-wide `MutationObserver` plus a `resize` listener and rAF to place the composer button (`src/gui.tsx`).
- Server: a 30 second deadline check and the usage poll, at the notch app's pace (5 minute floor per account).

| Scenario | Bare | With plugin | Delta | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle | | | | zero callbacks | not measured |
| streaming reply | | | | within 3% scripting | not measured |
| 10 session switches | | | | within 3% scripting | not measured |

### Realistic thread, 2026-11-02 (`scripts/perf.mjs`)

650 assistant messages with reasoning, tool output, diffs, 26 subagent children, injected rows and attachments; Side tabs; stub model. Median of 3 runs; delta is against the `null` plugin (the host's cost of loading any plugin). Script ms is main-thread scripting in the scenario window.

| Scenario | Floor script ms | With plugin | Delta | New long tasks | New frames over 20 ms | Frame p95 ms (floor) | Result |
|---|---|---|---|---|---|---|---|
| scroll | 310 | 335 | 25 | 0 | 0 | 16.6 (16.5) | PASS |
| type | 150 | 170 | 20 | 0 | -1 | 9.3 (9.8) | PASS |
| switch | 131 | 130 | -1 | 0 | -1 | 9.3 (10.1) | PASS |
| stream | 253 | 250 | -3 | 0 | 0 | 9.2 (9.9) | PASS |
| hover | 176 | 182 | 6 | 0 | -1 | 9.3 (9.9) | PASS |
| idle | 85 | 84 | -1 | 0 | 0 | 9.2 (9.9) | PASS |
| open thread (settled, ms) | 372 | 366 | -6 | | | | PASS |
| reopen thread (settled, ms) | 48 | 48 | -1 | | | | PASS |

## Notifications (M5)

The server emits one RPC event, `notify` (`src/notify.ts`, the hub's shape spelled out as the monitor and scheduler do); the GUI half calls `acquirePublisher` and `notifyFromServer` from native-ui's `notify-contract`: the `notifications` plugin when installed, else a toast of our own with Open.

- **Decisions.** (1) The limit being hit is an `error` keyed `usage-resume:limit:<session>`: "Usage limit reached, resumes 14:05" when it waits, "Usage limit reached" with "Auto-resume is off for this session." when the toggle is off (the host's own "Run failed" for that session is absorbed by the hub's merge rule). (2) A later announcement (the due time moved) is `info` "Resumes 15:10", key `usage-resume:resume:<session>`: it starts no turn. (3) The attempt cap is an `error` keyed `giveup`. (4) A resume that succeeds says nothing: the queued prompt starts a turn, whose done or error the host reports (user rule: a wake that starts a turn leaves no extra mark). (5) The timeline notices stay, as the record in the session, and do not depend on the `notifications` option. (6) The pill is unchanged.
- **Not verified against a real limit.** The harness cannot trigger Claude's limit. A stub provider (`@ai-sdk/openai-compatible` pointed at a local server that answers 429 with `{"error":{"message":"Claude usage limit reached","resets_at":"<iso>"}}`) drives the real detector, retry hook, server and RPC event to the GUI: toggle off shows the error toast "Auto-resume is off for this session", toggle on shows "Usage limit reached, resumes 04:09 PM" and the pill "Resuming 16:09", with and without `notifications` loaded (the hub's registry then lists `usage-resume` as a publisher). The harness run found that `body: undefined` fails the event's schema; the server now leaves absent fields out, and a test keeps it so. The provider's real CLI error text is covered only by the unit tests.
- The title uses the system's 12 or 24 hour clock (`toLocaleTimeString`, as the timeline notice does) while the pill reads 24 hour: an existing difference, not changed here.
