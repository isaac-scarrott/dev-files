# Name frames and arrange a page

## Names

`<Screen> · <width> · <brand> · <state>`, for example `Product · 390 · Acme · date picker open`. `state` is `default` for the full-page capture; a state rendered from code rather than captured ends `(from code)`; an approved change that has not shipped ends `(next)` and otherwise carries the name of the frame it changes; a board of notes is named `Notes · <subject>`.

## The page

`node snap.mjs layout --file F --page P --title "<band title>" [--order "Home,Search,Product"] [--overline "<label>"] [--subtitle "<one line>"]`

- One graphite band (`#24272C`, 48px radius) per journey, holding a title block and one group per screen.
- Groups (`#33373D`, 32px radius, white label) stack top to bottom in journey order, left-aligned, 240px apart. `--order` sets the order; without it groups follow first appearance.
- Inside a group the frames run left to right in one row, top-aligned, 80px apart: desktop widths first, then mobile, default state before open states, `(from code)` frames last. A `(next)` frame sits directly after the frame it changes, or last when no frame has its name. `Notes · …` boards form the last group.
- Groups come from the frame names. `--groups groups.json` (`[{ "name", "views", "artboards": [ids] }]`) replaces that when frames need a hand-picked order.
- The band starts at 0,0 on a clean page, or 400px below content the layout does not own; `--x` / `--y` place it.
- Rerunning replaces the previous run's work: every artboard named `… · background` and the title board are deleted and rebuilt, and frames are only moved.

Done when `node canvas.mjs boards --file F --page P` shows every frame inside its group's background and the output's `unplaced` list is empty or explained.
