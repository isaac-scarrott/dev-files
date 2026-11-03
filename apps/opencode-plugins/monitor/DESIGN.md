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
- **Reload is not restart** (user, 2026-11-03): a hot reload loads the module again in the same service process, once per project directory, and disposes the old copy. Killing and restoring there counted a restart, sent a notice and left a window with no process, so `restartCount` lost its meaning. Now `dispose` hands each monitor to a registry on `globalThis[Symbol.for("opencode.monitor.handoff")]` (plain data and functions, so an older copy of the module cannot run stale classes) and leaves the process group alone: timers stop, the child's pipes are held by a `Port` (buffers output up to 1 MiB and an exit while nobody is attached), the in-memory counters (seq, events, pending lines, rate window, re-arm marks, partial line) travel in the handoff. `restore()` of the directory's new instance claims the monitor and adopts it: same pid, no `restartCount` change, no note. The claim is synchronous right before the adoption (no await in between), so with several instances exactly one owns each monitor. If the new instance loads first, the claim takes a live monitor from its owner (`detach`), so load order does not matter. Marks that passed in the gap fire at once; an exit in the gap is replayed and handled normally (end, or wait for the re-arm). Session gone in the gap: the process is ended quietly. Not claimed within 30 s: ended.
  The SDK gives no dispose reason, so a real shutdown is told apart by the process: a `SIGTERM`/`SIGINT`/`SIGHUP` listener (installed once, only for signals the host already handles, so it cannot stop a signal from ending the process) marks `shuttingDown`, after which `dispose` terminates as before (SIGTERM, grace, SIGKILL) and anything already parked is signalled the same way. A process `exit` hook is the backstop that signals every group left. Only a restarted service process (empty registry) takes the restore path that counts and announces. Rejected: a detached child writing to a log file that any instance tails. It would also survive a hard kill of the service, but needs a file protocol, offset persistence, log cleanup and a second liveness check (pid reuse); the ask was reload != restart, and reload is fully covered in-process.
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

## Composer chip (`src/gui.tsx`, `src/chip.ts`, `src/rpc.ts` `list`, `src/control.ts`)

A "N monitors" chip in the row above the composer, from `native-ui`'s `createSessionChip` (design, host facts, motion, the Hidden setting and measurements in [native-ui DESIGN](../native-ui/DESIGN.md#composer-chips-chip-motionts-lane-chipts-lane-chip-rowstsx-session-chiptsx-chip-timets)). Decisions (user, 2026-11-02):

- **Scope: aimed at the session on screen.** The server half answers `list({ sessionID })` with the monitors whose definition wakes that session, whoever started them: `id`, `name`, `state` (`running`, `waiting` between re-arms, `paused`), `events`, `maxEvents`, `expiresAt`, `nextRearmAt`. Numbers and a name only: never the command, the cwd or any output. Like the existing calls it carries the session's `location`, because a monitor lives in the plugin instance of the directory its session runs in. A client without the server half gets an empty list and shows no chip.
- **Row = the host's one-line row** (user, 2026-11-02; supersedes the two-line row): name at the start, the status as the muted trailing text where the host shows the elapsed time (hidden on hover, where Stop takes its place), the host's live spinner as the glyph while the monitor runs (every listed monitor does). No count heading. Details in [native-ui DESIGN](../native-ui/DESIGN.md).
- **Row text.** The status is `3 of 50 events · re-arms in 12m · expires in 1h 5m` (`monitorStatus`): events against the cap when there is one, `re-arms in` only while waiting between runs, `paused` when the hourly cap paused it, `expires in` always. Spans round up to the minute; the popover's one timer wakes at the next change.
- **Stop** reuses `stop({ id, sessionID })`, which refuses a session that is not the monitor's own. The row leaves at once; if the monitor was already gone a toast says so.
- **Icon: a heartbeat, not the terminal prompt** (user, 2026-11-03). Every place the monitor drew `outline-console` (composer chip, the popover rows' spinner, the timeline row's icon) now draws native-ui's `HeartbeatIcon` / heartbeat chip (design and measurements in [native-ui DESIGN](../native-ui/DESIGN.md#heartbeat-icon-heartbeatts)). It replaces the radar spinner in the popover rows. Chip: live while any listed monitor is at work; the flat line when every listed one is paused (`restIcon`; paused is the only alive-but-idle state, ended monitors leave the list). Rows: `live` for the newest wake of a monitor that still runs, `still` (trace at rest) for its older wakes (a screen of beating rows is noise and cost; an unanswered `running` question also shows `still`), `flat` once it has ended or been stopped from the row. A crashed or lost monitor is an ended one: the same flat line, and its error stays in the row's text and the notification (the notifications plugin's shared kind glyphs are untouched). Rows and chip both sweep (user, 2026-11-03, a follow-up: the chip had only flashed because the host's capsule takes no child): a band slides along the trace in rows, and on the chip three thirds of the trace (the capsule's `svg` and its two pseudo-elements) pulse in turn by opacity; both are compositor-only (a `clip-path` window was measured and rejected: it re-rasterises every frame, 75 + 150 ms/s of renderer + GPU for one icon). The trace is thinner (0.9px) with a compact spike, resting in the muted token and pulsing in the base token; a quick beat in the first 40% of the 2s loop, then rest. One shared clock: all beats are pinned to the document timeline's origin (`syncHeartbeats`), so they pulse in phase rather than as a ragged chorus.
- **No navigation:** the monitor wakes the session on screen by definition, so there is no other target to open.

## Not done
- Renewing a TTL without starting a new monitor (decided against: the expiry wake is the prompt to start again).

## Tests
`monitor.test.ts` uses a fake clock and fake spawn. `process.test.ts` uses real processes and checks the group kill.
Live check (private `opencode-cli serve`, isolated XDG dirs, a harness plugin calling the registered tools): wakes land
as user messages, `monitor.stop` ends sleeping grandchildren, SIGTERM to the server leaves no children.

## Performance
The chip adds nothing at idle (no timer, observer or request while the popover is closed) and two requests per message change; see the table in [native-ui DESIGN](../native-ui/DESIGN.md#composer-chips-harness-225-monitor--scheduler-loaded-a-session-with-a-running-subagent-a-monitor-and-a-schedule). The `gui-experimental.cjs` bundle grew from 19.1 kB to 30.5 kB.

### Realistic thread, 2026-11-02 (`scripts/perf.mjs`)

650 assistant messages with reasoning, tool output, diffs, 26 subagent children, injected rows and attachments; Side tabs; stub model. Median of 3 runs; delta is against the `null` plugin (the host's cost of loading any plugin). Script ms is main-thread scripting in the scenario window.

| Scenario | Floor script ms | With plugin | Delta | New long tasks | New frames over 20 ms | Frame p95 ms (floor) | Result |
|---|---|---|---|---|---|---|---|
| scroll | 310 | 325 | 15 | 0 | -1 | 16.7 (16.5) | PASS |
| type | 150 | 153 | 3 | 0 | -1 | 9.1 (9.8) | PASS |
| switch | 131 | 152 | 21 | 0 | -1 | 9.2 (10.1) | **FAIL** |
| stream | 253 | 252 | -1 | 0 | 0 | 9.3 (9.9) | PASS |
| hover | 176 | 168 | -8 | 0 | -1 | 9.2 (9.9) | PASS |
| idle | 85 | 81 | -4 | 0 | 0 | 9.2 (9.9) | PASS |
| open thread (settled, ms) | 372 | 370 | -3 | | | | PASS |
| reopen thread (settled, ms) | 48 | 48 | -1 | | | | PASS |
