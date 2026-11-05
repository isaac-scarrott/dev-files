# question-async design

## Problem

The built-in `question` tool always blocks the agent's turn until the user answers. When several things are running
at once (background workers, a long test suite, a monitor), a low-stakes side question shouldn't have to stop
everything else.

## Why extend, not replace

Considered: a second tool (`question_async`) beside the native one. An eval (two subagents, six scenarios, same
blocking/non-blocking judgment call each) scored both designs 6/6 — no accuracy difference. Given that, extending
the one tool with a `blocking` argument won on simplicity: one schema for the model to learn, and no risk of the
model reaching for the wrong one of two similarly-named tools.

## Why this isn't a hack

An earlier plan relied on tool-id collision in the OSS CLI's registry (last writer into a plain object wins) and a
version-pinned safety check. Reading `@opencode/plugin` (the GUI SDK actually in use here, distinct from and newer
than the OSS `packages/opencode` registry code) turned up `ToolEditor.update(id, fn)`:

```ts
interface ToolEditor {
  list(): readonly (Info & { id: string })[]
  get(id: string): (Info & { id: string }) | undefined
  namespace(namespace: Tool.Namespace): void
  add<Input, Output>(tool: Info<Input, Output>): void
  /** Updates an existing tool; missing IDs are ignored. */
  update(id: string, update: (tool: Types.Mutable<Info>) => void): void
  remove(id: string): void
}
```

"Missing IDs are ignored" is the host's own documented degrade path — not a hack we're relying on by accident.

## Safety, without a version pin

The check is structural, not a version string:

1. `editor.get("question")` must return something. If not, the tool was renamed or removed upstream — which breaks
   blocking questions too, for every session, independent of this plugin. Nothing to patch around; log and stop.
2. `existing.input` must be a plain JSON object schema (`{ type: "object", properties: {...} }`). The native tool's
   schema could in principle be a Zod instance or something else `ToolEditor` normalizes differently; we only know
   how to safely extend the plain-JSON-Schema shape, so anything else is left alone rather than guessed at.
3. `editor.update` runs inside a try/catch. If the mutator throws partway, the original `input`/`description`/
   `execute` are put back before anything else happens — the tool is never left half-mutated.
4. After the update, `editor.get("question")` is re-read and checked for the `blocking` property actually being
   present. If it isn't — a silent no-op, for whatever reason — this is treated the same as a failed probe.

In every failure branch: the native `question` tool is either untouched or restored, blocking questions work exactly
as they did before this plugin existed, and `[question-async] non-blocking override inactive (<reason>)` is written
to the plugin log so the failure is visible, not silent. There's no fallback tool: the only thing a failed override
costs is the `blocking: false` option for this session, which isn't safety-critical by itself (see "no fallback
tool" below).

## No fallback tool

An earlier version of this plan always registered a second tool (`question_fallback`) purely for the case where the
override failed. Dropped once the actual risk was clear: if `update` doesn't take, the native `question` tool is
simply untouched — blocking questions keep working exactly as before. A second tool's only job would have been
re-implementing the whole ask-and-wait flow independently (bypassing the native card entirely) to guarantee
non-blocking stays available even when the override fails — more surface area, another tool name for the model to
learn, for a feature that is convenience, not safety.

## How non-blocking actually answers

`blocking: false` does **not** reimplement the question card. It calls the *original* native `execute` (captured
before mutation) and does not await it before returning to the model. When that promise settles — answered or
dismissed — the result is delivered into the session as a synthetic message via `ctx.session.synthetic({ sessionID,
text, description, delivery: "queue" })`, the same mechanism `shell-handoff` uses to deliver its post-restart notices.
`delivery: "queue"` rather than `"steer"`: don't interrupt whatever the agent is doing when the answer lands, let it
arrive once the current step finishes.

This means the on-screen card is pixel-for-pixel the native one — there is no second UI to keep in parity, and no
risk of drifting from what `blocking: true` looks like.

## What's in `src/override.ts` vs `src/server.ts`

`override.ts` is pure: schema shape checks, the schema/description extension, answer-text extraction, and the
`execute` wrapper itself, all as plain functions taking plain data (or injected functions) so they're testable
without a live `ToolEditor` or session. `server.ts` is the thin wiring: `Plugin.define`, the `ctx.tool.transform`
probe-and-update sequence described above, and the one log line.

## Open / not yet done

- No toast to the user on override failure, only the plugin log (`~/.local/share/opencode/log/opencode.log`). A
  shared toast contract exists (see `toast-style`/`native-ui`) but wiring into it is a GUI-side dependency this
  plugin doesn't otherwise need; worth doing if a failed override turns out to go unnoticed in practice.
- Not yet run against a live Desktop session — tests cover `override.ts`'s logic against fakes, not against the
  real `ToolEditor`/`question` tool.
