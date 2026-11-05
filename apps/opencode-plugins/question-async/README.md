# question-async

Adds `question_background`, a separate tool alongside the host's built-in `question`: it asks the user something
without stopping the agent's own turn.

- **`question` (native, untouched):** blocks until the user answers.
- **`question_background` (this plugin):** the call returns at once. The same kind of dialog opens for the user;
  whenever they answer it, or close it without answering, that arrives later as a new message in the session.

## Install

Add to `.config/opencode/opencode.json`:

```json
{
  "plugin": ["/absolute/path/to/apps/opencode-plugins/question-async"]
}
```

## Why a separate tool, not an extended `question`

The first version of this plugin tried to extend the native `question` tool in place with a `blocking` argument,
using the host's `ToolEditor.update(id, fn)`. Real testing (via `opencode run --standalone`, not a relayed or
cached session — see `DESIGN.md`) found the native tool's schema is some internal representation that is neither
plain JSON Schema nor a recognizable Zod/Effect-Schema shape, so it can't be safely read or mutated. That path is
abandoned; see `DESIGN.md` for the full history.

`question_background` is additive instead: its own tool, own JSON Schema (authored directly, not derived from
anything external), own execute. It never touches the native tool, so there's nothing to probe or degrade — it
either loads or it doesn't, the same as any other plugin tool.

## How it answers

The tool's `execute` doesn't show any UI itself. It stores the pending questions, emits an `asked` RPC event, and
returns immediately. The plugin's GUI half listens for that event and shows the app's own `ctx.dialogs.select` /
`ctx.dialogs.prompt` dialogs — the same dialog primitives the host itself uses elsewhere, so there's no separate
card UI to keep in parity. Each question offers a single choice or free text; there's no multi-select (`ctx.dialogs.select`
only supports one pick). Once every question is answered, or the user closes a dialog without answering, the GUI
calls back into the server, which delivers the result into the session as a synthetic message
(`ctx.session.synthetic`, `delivery: "queue"` — same mechanism `shell-handoff` uses for its notices).

A question still pending across a server restart is lost (the in-memory map is gone); the user's dialog, if still
open, calls back to a server that no longer remembers the request, so it's rejected quietly rather than delivered
to the wrong place.
