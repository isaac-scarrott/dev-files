# Capture a site or flow into Paper

`snap.mjs journey` replays a journey file: it opens its own browser tab, sets each width, navigates, clicks, types and captures, writing every frame straight into Paper.

## 1. Write the journey

List the screens in the order a user meets them, and the open states worth keeping on each (menu, popover, dialog, sheet, filter panel). Find routes and control labels with one look at the start page; ask the user only for what only they hold (credentials, which product, a real payment).

```json
{
  "file": "<fileId>", "page": "<pageId>", "brand": "Acme", "widths": [1440, 390],
  "title": "Today · Acme shop",
  "steps": [
    { "screen": "Home", "url": "https://acme.example/", "capture": "full" },
    { "screen": "Home", "click": "Menu", "wait": { "selector": "[role=menu]" }, "capture": "component", "state": "menu open", "restore": "Escape" },
    { "screen": "Search", "url": "https://acme.example/search", "type": { "into": "Search", "text": "tent" }, "key": "Enter", "wait": { "text": "results" }, "capture": "full", "state": "results" },
    { "screen": "Search", "click": { "selector": "[data-view=map]" }, "capture": "viewport", "state": "map view", "widths": [1440] }
  ]
}
```

- A frame is named `<screen> · <width> · <brand> · <state>`; `state` defaults to `default`.
- A step runs `url`, then `click` / `hover` / `type` / `key` (or a `do` list of them for a sequence), then `wait`, then `capture`, then `restore`. Leave `capture` out for a step that only moves the flow on.
- Targets are a visible label or aria-label (`"Menu"`, exact match first) or `{ "selector": "css", "nth": 0 }`; both reach into shadow roots.
- `wait`: `"idle"` (the default after a `url`), milliseconds, `{ "selector" }`, `{ "text" }` or `{ "gone": "text" }`.
- `capture`: `"full"` for a screen's default state (the whole page, lazy images loaded; `"lazy": "eager"` when scrolling would trigger infinite loading). `"component"` for an open state: the topmost overlay and the trigger it hangs from, on a `#F9F9FA` ground with 24px padding; `selector` names the element when it has no dialog, menu or listbox role. `"viewport"` for a whole-page mode that is not an overlay.
- `restore` closes the state for the next step: a key name, or a list of actions.
- `widths` on a step limits it to those widths; `height` overrides 900 / 844. A width under 500 is emulated as a phone (touch, 2x).
- `page` on a step sends that frame to another page of the file; `stylesheets` on the journey lists font stylesheets to add after each navigation, for a component harness that names a font it does not load.
- `mutates: "<what it changes>"` marks a step that changes data on the site. A dry run still clicks, so it skips these steps (`skip` lines) unless `--mutate` is given; the real run performs them. `comment` on a step or the journey is for the reader.
- `title` (with optional `overline`, `subtitle`, `order`) makes the run finish with `layout` ([`LAYOUT.md`](LAYOUT.md)).

A one-time sign-in link goes on the command line, never in the file: `--start "<url>"` opens it first, and each later width pass begins again where it landed. The browser's profile lasts one command, so the session does too: put every signed-in screen in the one journey, and ask for a fresh link per run.

Done when every screen and state in the request has a step.

## 2. Dry run

`node snap.mjs journey journey.json --dry-run` drives the browser and serialises, writing nothing to Paper. Its last lines give what the run would add and the file's current size (`would add 2200 layers, ~319 KB | file now 19645 layers, ~3837 KB`): Paper's size limit only shows itself when a write fails, so split the run across files when the sum is far beyond what the file already took. Done when every line reads `dry` or `skip`; a `FAIL` line names the step, the reason and, for a missing control, the labels on screen.

## 3. Run

`node snap.mjs journey journey.json`, then `--only "<screen glob>"` or `--widths 390` to redo what failed. Done when every line reads `ok` and the last line counts 0 failed, or each failure is in your report with its reason.

## 4. Verify

`node canvas.mjs verify --file F --page P` ([`CANVAS.md`](CANVAS.md)). Done when each frame is above 85% or its worst region has been looked at and explained.

## When the journey cannot do a step

One page with no steps needs no journey: `node snap.mjs snap --url <url> --file F --page P --name "<name>" (--mode full --lazy | --component [css] | --mode viewport) [--width <w>] [--start "<sign-in url>"] [--wait <ms | css>]` opens its own tab, sets the width, loads the page and captures it. `capture` in place of `snap` takes the same flags, writes nothing to Paper and prints the size, bytes and node count.

A step the scripts cannot perform (a login only the user can do, a native `<select>` or file picker, a drag gesture, controls inside a cross-origin iframe) needs a browser a person drives. Ask the user to start one of their own and do the step there:

`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9333 --user-data-dir="$HOME/.paper-chrome"`

Then run with `PAPER_CDP=http://localhost:9333` and attach to their tab: `"tab": "<url substring>"` on the journey, or `snap --target <url substring>` (a tab's `window.__paperSnap` value also matches); `--width` fails the capture when that tab is not that wide. Synth's browser is never that browser: the scripts refuse port 9300.

A state the live site cannot show (empty, error, a role you lack) is best rendered by the project's own component harness or storybook: point a journey at it and end `state` with `(from code)`, so the page stays honest about what was reconstructed.

## What does not survive the trip

- Cross-origin iframes (payments, embedded maps, video) become grey placeholders labelled with their host; canvas and video become one image.
- Only font family names travel: Paper renders Google and locally installed fonts, others fall back and text can reflow.
- A Paper text layer holds one style, so a bold word or link inside a paragraph takes the paragraph's style.
- `position: fixed` boxes sit where they were at capture; `sticky` is static in a full capture.
- Images stay remote URLs that Paper fetches.
