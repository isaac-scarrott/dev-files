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

The tool's `execute` stores the request and returns at once. The plugin's GUI half turns it into a host form
(`client.session.form.create`, shaped like the built-in `question` tool's), so the user gets the host's own question
card, with the same attention mark, multi-select (`multiple: true` on a question) and free-text answer. The server
half hears `form.replied` / `form.cancelled` and delivers the result into the session as a synthetic message
(`ctx.session.synthetic`, `delivery: "queue"`). Not reproduced: the "Questions · N answered" row in the timeline
(host tool renderer, keyed by tool name). See `DESIGN.md` for evidence and deviations.
