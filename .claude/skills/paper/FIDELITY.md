# List how a built page differs from its frame

`node fidelity.mjs --file F --node <frameId> --url <built page> [--width N] [--ready '<css>'] [--json]`

It loads the page at the frame's width, waits for it to settle, and prints one line per difference, largest first: `kind  "section" › "element"  property  frame → built`. It reports; the owner decides which side is right, so hand each line on as "accept" or "close". Exit 0: none beyond tolerance. 1: differences. 2: no comparison (the page never settled, or no section of the frame was found on it).

- **Settled** means network idle, fonts loaded, images in and the layout still for two checks; `--ready` adds a selector that must be visible (shadow roots are searched). Pass it when the page shows a skeleton first.
- **Sections** are the frame's top-level children that hold text; a lone wrapper is looked through, and a child over half the frame's height is split into its children. A section is named by its largest text, and found on the page as the largest block holding that text and no other section's. With several page texts of that wording, the one nearest the frame's position wins.
- **Kinds**: `structure` (a section missing, extra or out of order), `size` (height, gap above, content left and right at the ends of a row; beyond 4px or 2%), `style` (font size, weight, line height, colour beyond a just-noticeable step, family), `text` (wording; `missing` or `absent` when one side has no such text).
- The first line is `canvas.mjs verify`'s score over the first screen of the page, with its worst region. The second counts matched sections and texts: read a low count as "wrong page or wrong state" before reading the lines.
- Default output stops at the 40 largest differences and says how many remain; `--json` holds all of them and every section's box on both sides.

What it cannot see:

- Paper gives no position or size for auto-sized layers, so the frame's export is laid out in the same browser tab, in the page's fonts. A `note:` line appears when that layout's height disagrees with Paper's.
- A text is one block of inline content and takes one style: a bold word inside a sentence is not compared.
- A section with no text cannot be matched; pictures, icons, borders, shadows, radii and backgrounds are covered by the visual score alone.
- Closed shadow roots, cross-origin iframes and anything below a "load more" are not read.
- Live data moves between loads: a results page reports products that came and went as `structure` lines.

`--inject <file.css|file.js>` is a testing aid: the CSS is applied to the document and every open shadow root, or the JS is run, once the page has settled. Use it to plant a difference and check that it is reported.

Done when every line is accepted, closed or explained as live data.
