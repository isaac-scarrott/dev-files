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

## How it answers, concretely (design 4: the host's own form)

The host (2.2.5) has native forms: `client.session.form.create({sessionID, title, metadata, fields})`, with events
`form.created` / `form.replied` / `form.cancelled`. The built-in `question` tool is one underneath: its form is
`{title: "Questions", metadata: {kind: "question", tool: {messageID, id}}, fields: [{key: "q0", type: "string", title: header,
description: question, options, custom: true}]}` (read from `client.session.form.list` while a native question was pending).
Creating the same shape from a plugin makes the host draw its own question dock, so there is no card to keep in parity.

- **Tool `execute`** (server) stores `{requestID, sessionID, messageID, callID, questions}` (also in `ctx.storage`), emits
  `asked`, returns at once.
- **GUI half** claims the request over RPC (first window wins, so one question is one form), then calls
  `client.session.form.create`. A window that opens later asks `pending` for unclaimed requests. A create failure
  toasts and tells the server (`failed`), which delivers that to the agent instead of leaving it waiting.
- **Server** subscribes to `form.created` (records the formID from `metadata.requestID`), `form.replied` and
  `form.cancelled`, and delivers with `ctx.session.synthetic` (`delivery: "queue"`). Delivery deletes the pending entry
  first, so a repeated event delivers nothing. Events for forms it did not make are ignored.
- **Mapping**: `header`→field `title`, `question`→`description`, options→options (`value` = label), free text via
  `custom: true`, `multiple: true`→a `multiselect` field. All questions of a call are one form.

## Evidence (2.2.5, private harness, stub model)

- Same dock as native: screenshots of the built-in card and the form card are pixel-identical in layout (title row
  "1 of 2 questions", step dashes, option rows with numbers, "Type your own answer…", Dismiss / Next / Submit, ⌘⏎
  tooltip). Multi-select shows checkboxes and "Select all answers that apply".
- Non-blocking: the stub's turn finished ("Done.") while the card was still open.
- Answer round trip: Dark + Alpha/Beta arrived as `The user answered your background questions: "Which theme?"="Dark",
  "Which extras?"="Alpha, Beta"…`. Dismiss arrived as the dismissed message.
- The card survives a window reload (the form lives on the service).
- Attention mark: a session with a pending form shows `[data-mark="attention"]` on its tab while another tab is viewed,
  same as a pending native question.

## Accepted deviations

- **No "Questions · N answered" row afterwards.** That summary is a host tool renderer registered by tool *name*
  (`question`, reading `metadata.answers`); plugins have no registry for tool renderers. Our call is shown as the
  code-mode "Used 1 Execute" row, and nothing replaces it once answered. The answer is still in the thread as the
  delivered message. Closest option, not built: none without a host API.
- **Answered forms leave the dock** and are not listed afterwards (`session.form.list` returns pending only).
- **The attention mark is not visible on the tab you are viewing**, native or not.

## Known limits

- **Lost UI across a restart before the form exists.** A request not yet turned into a form is kept in `ctx.storage`
  and offered to the next window that opens (`pending`). A request whose form exists keeps working across restarts.
- **First load needs a service restart.** The host reads a plugin's GUI export only on its first load. Ship the GUI
  export before a plugin's first load.
