# Icons

Use the app's catalog first: `ctx.ui.Icon name="…"` or any `icon` field in the SDK (`IconName` in `node_modules/@opencode/plugin/dist/gui/registries.d.ts`). Search that union for the concept before drawing anything (`warning`, `help`, `arrow-up`, `console`, `branch`, `outline-xmark`, …). Icons draw in `currentColor`, so colour comes from the parent's text colour.

## Drawing a missing icon (OpenCode DNA)

The catalog itself is the style guide (source: `ui/src/icons/catalog.ts`, `new-icons.ts`, `icon/additional-icons.ts`; extract from the app's sourcemaps per `build.md`). Match it:

- Outline only, drawn with `stroke="currentColor"` and the default 1px stroke; a solid `fill="currentColor"` only for small dots or arrow heads. Never hardcode colours.
- Two grids exist: 16x16 (`viewBox="0 0 16 16"`, most icons) and 20x20 (additional icons). Pick 16x16 and centre the artwork in the box; 1.5px of padding at the edge.
- `stroke-linecap="round"` with `round` joins in the 16px set; `square` caps in the 20px set. Do not mix inside one icon.
- Geometry on whole or half pixels so 1px lines stay crisp. Ready simple shapes: circle r 6, rect rx 1 to 2, short straight segments. No gradients, shadows or two-tone.
- Compare against its closest catalog neighbour at 14px and 16px before shipping.

Render it with the same wrapper the host uses so size and colour follow the theme: an inline `<svg viewBox="0 0 16 16" width="16" height="16" fill="none">…</svg>` inside an element that sets `color`. Keep each custom icon in one `icons.ts` with a comment naming the nearest catalog icon it extends.
