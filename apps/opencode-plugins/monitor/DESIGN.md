# monitor: design

Server plugin for OpenCode Desktop 2.2.5. Tools: `monitor.start`, `monitor.list`, `monitor.stop` (namespace `monitor`), registered like
`orchestrator-tools`, through `ctx.tool.transform`, Code Mode on.

## Decisions
- **Delivery**: `ctx.session.prompt({ delivery: "steer" })` always, idle or busy. Not exposed to the model or options.
- **Approval**: the SDK exposes `ctx.permission.assert`. The tool asserts `shell` with the command as the resource (the
  host's own shell tool uses the same action and resource) and `external_directory` for a `cwd` outside the session
  directory. `options.permission: "shell"` also lets the host treat the tool as shell. Re-arm restarts and restores reuse
  the first approval.
- **Untrusted output**: lines are XML-escaped (`& < >`), so a line holding `</monitor-event>` cannot close the block;
  the name is escaped as an attribute. Plugin notices (pause, restart, ended) travel in a separate
  `<monitor-notice>` block. Every wake ends with a trailer.
- **Batching**: first line starts a `batchSeconds` timer; the timer flushes everything gathered. At most
  `maxLinesPerWake` lines are kept, the rest counted ("N more lines not shown"). Unsent bytes are capped.
- **Re-arm**: `rearmMinutes` is the cycle length measured from each start. A run still going at the mark is ended and
  restarted; a run that exited early waits for the mark (no hot loops). A clean exit inside a cycle is silent; a
  non-zero exit wakes with the next start time. Seq continues across runs.
  The next mark (`nextRearmAt`) is absolute and persisted. On restore a mark still ahead keeps its remaining time; a mark that
  passed counts as satisfied by the fresh process (`lastRearmAt` = now) and the next one is set from now. So restarts more
  frequent than the cycle cannot starve it.
- **Rate**: sliding one-hour window of accepted lines. Over the cap: drop and count, notice once, resume notice when the
  window has room. A monitor never ends because of rate.
- **Lifetime**: TTL covers the whole monitor, re-arm included. Ends on exit (no re-arm), `maxEvents`, TTL, stop, session
  archived/deleted (`session.archived`, `session.deleted`), 3 failed wakes in a row, and dispose.
- **Persistence**: definitions under `monitor/def/<id>`, never output. Run state under `monitor/state/<id>`: `seq`, `restartCount`,
  `aliveAt` (heartbeat every 60 s, each wake, and clean shutdown), `lastRearmAt`, `nextRearmAt`. Writes per monitor are serialized
  and the state is removed with the definition. Missing state (older entries) reads as: unknown downtime start, due re-arm. On startup only entries with a re-arm
  schedule, an unexpired TTL and an active session come back, and the first wake says so. The plugin loads once per
  directory and instances share storage, so each stores its `origin` directory and restores only its own.
- **Process**: `$SHELL -c command`, `detached` so it leads a process group; kill signals `-pid`. After the leader exits the
  group gets a final SIGKILL for strays. Output is drained for at most 300 ms after exit.
- **`session` argument**: may name only a session the caller already controls: itself, its parent, descendants, sessions
  it created (`orchestrator` metadata marker) and siblings. That is orchestrator-tools' `tree` scope (`reachable` plus
  the parent `list_peers` shows), copied into `reach.ts` since plugins are separate packages; there is no wider option.
  Archived or missing targets and anything outside the tree are rejected. The working directory is always the caller's.
- **Restart notices**: `<monitor-notice … seq="N" restart="K">` with "down from A to B" (A = last known alive, or an explicit
  "unknown"). Decision: event `seq` is persisted and continues across restarts (rather than labelling notices apart), so a
  `seq` identifies one wake of a monitor for good; `restart` counts service restarts. Only the notice carries `restart`.
  Output stays escaped (`>` as `&gt;`) and nothing about delivery is mentioned.
- **Lost at restart**: a definition that is not restored (no re-arm, TTL passed, `maxMonitors` hit) wakes its session
  once with a `<monitor-notice>`: gone, can be started again. The stored entry is removed before the wake, so repeated
  restarts or a failed wake never announce it twice. Archived/deleted sessions get nothing.
- **TTL**: `expiresAt` is stored absolute and set once at the first start. Re-arms and restarts never move it (tested). Expiry
  wakes as before; there is no renew option.
- **`match`**: tested before an output line counts as an event, so batching, `maxEvents` and the rate window see matched lines only.

## Not done
- Renewing a TTL without starting a new monitor (decided against: the expiry wake is the prompt to start again).

## Tests
`monitor.test.ts` uses a fake clock and fake spawn. `process.test.ts` uses real processes and checks the group kill.
Live check (private `opencode-cli serve`, isolated XDG dirs, a harness plugin calling the registered tools): wakes land
as user messages, `monitor.stop` ends sleeping grandchildren, SIGTERM to the server leaves no children.
