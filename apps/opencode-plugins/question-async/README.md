# question-async

Extends the host's built-in `question` tool with a `blocking` argument, so an agent can ask the user something without
stopping its own turn.

- **`blocking: true` (default):** unchanged. Calls the native `question` tool exactly as before.
- **`blocking: false`:** the native question card still opens, but the tool call returns at once. The agent keeps
  working; whenever the user answers (or dismisses the card), the answer arrives as a new message in that session.

## Install

Add to `.config/opencode/opencode.json`:

```json
{
  "plugin": ["/absolute/path/to/apps/opencode-plugins/question-async"]
}
```

## How the override works, and how it fails safely

There's no supported "disable the built-in tool" switch, so this uses the host's own `ToolEditor.update(id, fn)` API
(from `@opencode/plugin`) to extend the registered `question` tool in place. See `DESIGN.md` for the full reasoning.

In short: at startup, the plugin checks that `question` exists and that its input schema is a plain JSON object schema
it knows how to extend. If either check fails — or the update throws, or it silently doesn't stick — the plugin leaves
the native tool exactly as it found it and logs why (`[question-async] non-blocking override inactive (...)`). Blocking
questions are never at risk: the extension only adds a code path for `blocking: false`, and always defers to the
original `execute` function for everything else.

Nothing here is pinned to an OpenCode version number. The check is structural (does the shape we depend on still
exist?), not a version string, so it keeps working across releases that don't change that shape, and degrades visibly
—rather than breaking the whole plugin host — in ones that do.
