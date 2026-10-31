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

The detector therefore matches the message text, and also a 429 whose body mentions a limit or a `resets_at`, and uses
`retryAfterMs` as a last resort for the reset time. A reset more than 8 days away is treated as a misparse.
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
  API (`ctx.toast` is GUI-only), and a timeline notice sits in the session it is about, so there is no GUI part.
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

## Decisions (defaults)

| Decision | Default | Option |
|---|---|---|
| Which sessions | all top-level sessions stalled by a Claude limit; subagent sessions (with a parent) skipped, since the parent decides what to do with a failed child | `includeChildren` |
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
- `src/server.ts`: wiring: events, retry hook, tick.

## Known limits

- A stall that happened while the plugin was not loaded (or the desktop app was quit) is not found afterwards; only
  stalls seen live and persisted are resumed.
- If the app is quit while sessions wait, nothing resumes until it is reopened; then overdue sessions resume on the first tick.
- The error shape was read from the binary, not observed live. If a bare 429 carries no limit text it is not treated as a
  usage limit (it is usually a short rate limit that OpenCode already retries).
