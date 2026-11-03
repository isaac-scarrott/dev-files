# Toast style

Every toast in the app, whoever raises it, in one quiet card: the app's own font and motion, the glyph on the title's row with the text and buttons under it at full width, two lines of description, a contrast button for a waiting request, and a "+N more" chip over a stack.

> **Credit:** The card, its numbers (320 wide, 12 padding, 8 radius, 280ms `cubic-bezier(.2,0,0,1)`) are the app's own `.toast-v2` rule, which solid-sonner's later stylesheet overrides today. The toast engine is [sonner](https://github.com/emilkowalski/sonner) by Emil Kowalski (MIT) through solid-sonner; the exit curve and the reduced-motion rule follow his animation guidance. No third-party code.

## What it does
- **The app's own font and motion back.** solid-sonner's stylesheet loads after the app's and wins the cascade, so toasts render in the system font, move 400ms on `ease` and peek 12px. This plugin restores Inter, 280ms `cubic-bezier(.2,0,0,1)` (opacity 160ms), and sets the peek to 8px with a 4% step.
- **One layout for every toast.** The glyph shares the title's row (16px glyph, 8px gap, title); the description (two lines, then an ellipsis) and the buttons start at the card's left edge and use its full width. No empty strip under the glyph. A toast without a glyph is the same card with the title at the left.
- **Buttons.** The first is the app's neutral button; later ones are quiet (the app's ghost-muted look). A waiting request (the `notifications` glyph) gets the app's contrast button, and the key that opens it (`⌘I`) on the front card when another plugin sets it.
- **Exit and reduced motion.** A card leaves with a 160ms fade, 6px down and 2% smaller; with reduced motion nothing moves and the fade is 120ms.
- **"+N more".** Past three visible cards a small chip above the collapsed stack counts the hidden ones; it goes while the stack is fanned out on hover.
- Glyph colours are never touched: every glyph keeps the app's neutral icon colour, so kinds read by shape (check, info, tray, x), persistence and buttons.

## Context
The app has no extension point for toast styling: `ctx.toast.show` takes a title, description, variant, glyph, duration, persistence and buttons, nothing else. The only handle is CSS on the app's markup, so every selector is in one file, [`src/host-markup.ts`](src/host-markup.ts), with the markup it depends on, and `test/markup-probe.mjs` fails in a running app when the markup or the cascade changes. Limits: the app closes a toast on any button (a "Copy details" button closes it too), orders stacks by time only, and gives a toast no role (`alert`); none can be changed from a plugin ([DESIGN.md](DESIGN.md#what-a-plugin-cannot-do)).

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/toast-style"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI; restart the background service (`opencode service restart`) for the first load of the GUI export. Works alone or with [`notifications`](../notifications), which raises the toasts it was designed with. Remove it and the app's toasts look exactly as before.

## Options
None. A plugin that knows which key opens the next waiting request may set `--toast-style-go-next-hint` on `:root` (a quoted string, for example `"⌘I"`); the front waiting-request toast then shows it on its first button. `notifications` does, and only while that key opens that toast.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked), `pnpm smoke` after a build. In a private harness with `test/probe-plugin` and this plugin loaded (see [browser-testing.md](../../../.claude/skills/opencode-gui-plugins/reference/browser-testing.md)): `OC_HARNESS_CDP_PORT=… OC_PW_ROOT=… npx tsx test/markup-probe.mjs`. Design notes and evidence: [DESIGN.md](DESIGN.md).
