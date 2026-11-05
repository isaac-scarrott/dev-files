# question-async design

## Problem

The built-in `question` tool always blocks the agent's turn until the user answers. When several things are
running at once (background workers, a long test suite, a monitor), a low-stakes side question shouldn't have to
stop everything else.

## History: three designs, in order tried

### 1. A second tool beside `question`, picked by the model

Considered first. An eval (two subagents, six scenarios, same blocking/non-blocking judgment call each) scored a
two-tool design and a one-tool-with-a-`blocking`-argument design 6/6 each — no accuracy difference. Given that, the
one-tool design won on simplicity grounds at the time.

### 2. Extend the native `question` tool with `editor.update`

`@opencode/plugin`'s `ToolEditor.update(id, fn)` is a real, documented extension point ("missing IDs are ignored" is
the host's own designed degrade path), distinct from and safer than an earlier idea of relying on tool-id collision
in the OSS CLI's registry. The plan: probe structurally (does `question` exist? is its schema a plain JSON object
schema?), and if so, wrap its `execute` so `blocking: false` fires the native ask without awaiting it, delivering
the eventual answer via `ctx.session.synthetic`.

This looked solid on paper and passed every test *I could run against a fake*. It failed in practice. Real
verification took much longer than expected, because every session that looked like a live test turned out not to
be one:

- My own session's `question` tool is Claude Code's own, fixed before the plugin loaded — never routed through the
  plugin host at all.
- Sessions created via `orchestrate`/subagent tools are also Claude-Code-hosted; they don't carry a `question` tool.
- A file-based diagnostic (writing status to disk from inside the plugin) wrote nothing useful at first, because
  `ctx.tool.transform`'s callback runs on every future tool-list *build*, not once at plugin setup — the first
  version wrote status right after registering the hook, before any build had asked for the tool list.

The one thing that gave a real, repeatable answer: `opencode run --standalone "<prompt>"`. That's a genuine
OpenCode CLI session (client type `cli`, which the host's own flag check for the `question` tool includes), using a
private server reading this project's real `opencode.json`, fast enough to iterate with directly. It showed:

- The real `question` tool's schema has no `blocking` property, confirming the override never took.
- The diagnostic, once moved inside the `tool.transform` hook, showed exactly why: `existing.input`'s `typeof` is
  `"function"`. Not a plain JSON Schema object (`{type, properties}`), not a Zod instance (`.extend`/`._def`), and
  not a plain Effect `Schema.Struct` either (checked directly against `effect`'s own `Schema.ts`: a real Effect
  schema is an object tagged with a symbol, not a bare function). Whatever this is, it's an internal representation
  with no documented contract — not something to guess at and mutate.

Abandoned once that was clear. The probe's own safety behaved exactly as designed the whole time: it never touched
the native tool, blocking questions were never affected, and the only cost was non-blocking questions being
unavailable — which is why "no fallback tool" (below) was already the right call before this was even found.

### 3. A separate `question_background` tool, additive only (current)

No shared schema, no mutation, no probe needed: `editor.add()` is the same mechanism `blindfold`'s own tools
already use in production, so it's proven, not a new risk. Trade-off versus design 1's one-tool-with-a-flag ideal:
the model now has two differently-named tools to choose between, which the eval said doesn't hurt accuracy, and
which is a smaller cost than depending on an unreadable internal schema shape.

## No fallback tool

Carried over from design 2's reasoning, and still true here: there's no scenario where `question_background` fails
to load that leaves the agent stuck, because `question` was never touched to begin with. If `question_background`
isn't available, that's just the old behavior — always blocking — not a broken state.

## How it answers, concretely

`question_background`'s `execute` does no UI work. It stores `{sessionID, questions}` keyed by a generated
`requestID`, emits an `asked` RPC event (`@opencode/schema/rpc`'s `Rpc.define`, the same contract shape `blindfold`
uses — see `src/rpc.ts`), and returns immediately with a message telling the agent to continue.

The GUI half (`src/gui.ts`) subscribes to `asked` and, for each question in order, calls `ctx.dialogs.select` (the
app's own picker dialog) with the question's options plus a "Type your own answer" entry that falls through to
`ctx.dialogs.prompt`. Closing any dialog without answering calls back with `dismiss`; completing every question
calls back with `answer`. Either way, the server delivers a `ctx.session.synthetic` message (`delivery: "queue"`,
not `"steer"`, so it doesn't interrupt whatever the agent is doing when the answer lands — the same choice
`shell-handoff` makes for its own notices).

Because `ctx.dialogs.select`/`prompt` are the host's own dialog primitives, there's no separate card UI to keep in
native-parity with — it already looks exactly like the rest of the app.

## Known limits (v1)

- **No multi-select.** `ctx.dialogs.select` returns one picked value; the native tool's `multiple: true` option has
  no equivalent here. The tool's description says so.
- **Lost across a server restart.** The pending-questions map is in memory only. A dialog left open across a
  restart calls back to a server that no longer has the request; the call is rejected quietly (not delivered to
  the wrong session), and the dialog should be closed with no error shown. Not yet handled more gracefully than
  that — acceptable for v1 since restarts are rare and the cost is "that one question needs re-asking."
- **Not yet confirmed end-to-end against a real dialog.** The server half is tested directly (`test/logic.test.ts`,
  `test/smoke.mjs`) and the tool is confirmed to register and execute correctly via `opencode run --standalone`.
  The GUI half's actual dialog behavior hasn't been exercised against a live Desktop session yet.
