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
  `events`, `lastEventAt`, `aliveAt` (heartbeat every 60 s, each wake, and clean shutdown), `lastRearmAt`, `nextRearmAt`. Writes per monitor are serialized
  and the state is removed with the definition. Missing state (older entries) reads as: unknown downtime start, due re-arm. On startup every entry with an unexpired TTL, events under `maxEvents` and an active session comes back (re-arm or not;
  without a schedule the command just starts fresh and has no re-arm clock), and the first wake says so. A stopped
  monitor has no state left, so it stays stopped. The plugin loads once per
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
- **Lost at restart**: a definition that is not restored (TTL passed, `maxEvents` reached, `maxMonitors` hit) wakes its session
  once with a `<monitor-notice>`: gone, can be started again. The stored entry is removed before the wake, so repeated
  restarts or a failed wake never announce it twice. Archived/deleted sessions get nothing.
- **TTL**: `expiresAt` is stored absolute and set once at the first start. Re-arms and restarts never move it (tested). Expiry
  wakes as before; there is no renew option.
- **Event count**: `events` (matched lines accepted as events) is persisted in the run state and restored, so `maxEvents` is a true
  lifetime cap (restart at 3 of 5 leaves 2). Re-arms never reset it. Saved on each wake, heartbeat and clean shutdown, not per
  line, so a hard kill can lose a few seconds of count. A restored state already at `maxEvents` is not restored (forgotten, session
  told it is gone). Older state without `events` reads as 0. The hourly window (sliding timestamps) is deliberately NOT persisted:
  it resets on restart, since downtime usually exceeds the hour and the cap is a flood guard, not a quota; `paused` likewise.
- **`match`**: tested before an output line counts as an event, so batching, `maxEvents` and the rate window see matched lines only.

## Desktop row (`src/gui.tsx`, `src/parse.ts`, `src/rpc.ts`, `src/control.ts`)

A wake is shown as the shared injected-message row from `native-ui` (design and measurements in [native-ui DESIGN](../native-ui/DESIGN.md) and the peer row's in [orchestrator-tools DESIGN](../orchestrator-tools/DESIGN.md)). Decisions (user, 2026-11-01):

- **Detection.** A user message is a monitor wake only when it carries the server's `metadata.monitor = { monitorID, seq }` and its text parses as one or more `<monitor-event>` / `<monitor-notice>` blocks of that monitor followed by the trailer (or nothing). A message a user typed with the same tags has no metadata and stays the user's bubble; one that has the metadata but text this parser cannot read (an unclosed tag, text before a block, a different trailer, another monitor's block) also falls back to the host's rendering, so nothing is hidden. The wrapper and its escaping are unchanged: the model gets exactly what it got before.
- **Content.** Lines are unescaped one level (`&gt;` becomes `>`, `&amp;` `&`, `&lt;` `<`, `&quot;` `"`); `&amp;gt;` therefore shows `&gt;`, which is what the command printed. Event blocks are monospace and scroll past 360px; notices are muted prose. Header: title = monitor name; preview = first line plus ` · N lines` for an event, `restarted (restart N)`, `lost`, `ended`, `paused`, `resumed` or `command exited` for a notice. Each parse is cached by message id and text, so a store change never re-parses a 5000-line message.
- **Stop.** The row offers Stop only while the monitor runs. The GUI half asks the server half (`rpc.ts`: `running({ ids })`, `stop({ id, sessionID })`; ids and booleans only) when the set of monitors on screen changes; a monitor that ends sends its last message, which is when that set changes. The plugin loads once per directory and a monitor lives in the instance of the directory its session runs in, so each call carries the session's `location` (without it the call reaches the default instance, which holds none of them; found and fixed in the harness). `stop` checks the monitor belongs to the calling row's session. If the monitor is already gone the row says so in a toast.
- **No server half, no button.** Without the RPC the row is still drawn; it just offers no Stop.

## Not done
- Renewing a TTL without starting a new monitor (decided against: the expiry wake is the prompt to start again).

## Tests
`monitor.test.ts` uses a fake clock and fake spawn. `process.test.ts` uses real processes and checks the group kill.
Live check (private `opencode-cli serve`, isolated XDG dirs, a harness plugin calling the registered tools): wakes land
as user messages, `monitor.stop` ends sleeping grandchildren, SIGTERM to the server leaves no children.
