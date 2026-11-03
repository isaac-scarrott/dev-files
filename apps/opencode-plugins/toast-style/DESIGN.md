# toast-style: design

Status: built. One GUI plugin, one `Style`, no behaviour of its own (no timer, observer or listener). Measured in the 2.2.5 desktop harness; ▸ is read from the live stylesheets and DOM.

## Decisions

Settled by the user (2026-11-03), after the design review of three directions ("Direction A: quiet card"):

1. **Direction A, applied to every toast.** The notifications plugin's toasts and the app's own are the same component (`ctx.toast.show` renders the app's solid-sonner `.toast-v2`), so they look and move identically. Nothing is scoped to a source. A separate plugin from `notifications`: it works with or without it, and removing it restores the app's look exactly (measured: zero computed-style differences against the bare app).
2. **Glyphs stay neutral.** No colour per kind and none for urgency: every glyph keeps the app's `icon-base`. Kinds are told apart by shape, persistence and buttons. This plugin sets no glyph colour and replaces no glyph (`style.test.ts` fails on a rule that does).
3. **The glyph shares the title's row; the text and buttons are full width** (16px glyph, 8px gap, title; description 2px under, buttons 10px under, both from the card's left edge). Replaces the app's glyph column.
4. **A waiting request's primary button is the app's dark contrast button**, and shows the key that opens it only on the front card and only while it opens that very toast. The key is a CSS variable another plugin sets; `notifications` sets it while exactly one session waits, it is the next stop of go-to-next and it is not the open session.
5. **Fix the cascade bug.** solid-sonner's stylesheet is injected after `main.css`, so its `[data-sonner-toast]` / `[data-sonner-toaster]` rules beat the app's `.toast-v2` ones. Restored with one more class of specificity: `.toast-v2-region .toast-v2`.
6. No upstream-ask drafting (the list below is a finding, not a request).

Decided here:

7. **Motion** is the app's declared 280ms `cubic-bezier(.2,0,0,1)` (opacity 160ms ease-out) for enter, reflow and expand; exit 160ms `cubic-bezier(.4,0,1,1)`, 6px down and scale .98 for the front card (a card behind keeps solid-sonner's removal path); reduced motion: opacity only, 120ms linear, no movement. Both `prefers-reduced-motion` and `:root[data-motion="reduce"]` (the app sets it from the media query), with `!important` and more specificity than solid-sonner's own `!important` reset.
8. **Stack**: peek 8px, scale step .04 (the app's own rule says 9.5px and .05, solid-sonner's wins with 12px and .05). Hover expansion keeps solid-sonner's 12px gap, and pausing of timers is solid-sonner's.
9. **"+N more"** is a CSS counter over hidden cards in `ol::after`; English text in the stylesheet (no translation path from CSS), hidden while fanned out.
10. **The hook on a kind is one selector**: the `notifications` glyph (`:has(> [data-icon] use[href$="icon-notifications"])`), for the contrast button and the key hint. If the app renames its icon sprite ids the button is neutral again and the probe fails. Everything else is attribute-free.

## Measured (2.2.5, harness, 1400×900)

| | App today (no plugin) | With toast-style |
|---|---|---|
| Font of text and buttons | system stack (`[data-sonner-toaster]` rule) | Inter |
| Transition on the card | 400ms `ease` (transform, opacity, height), 200ms box-shadow | 280ms `cubic-bezier(.2,0,0,1)` (opacity 160ms ease-out) |
| Enter, front card | 852 → 784px over ~400ms, opacity 0 → 1 | same path, opacity 1 at ~160ms, settled ~280ms |
| Exit, front card | falls its own height while fading, ~180ms visible | 6px, opacity 0 in ~160ms |
| Peek, 2nd and 3rd card | 12px, scale .95 / .90 | 8px, scale .96 / .92 |
| Expanded step | 116px (104 + 12) | 112px (100 + 12) |
| Description | unclamped (80px for four lines) | two lines (40px) |
| Card heights (done / needs-you / error / info) | 104 / 124 / 144 / 68 | 100 / 100 / 120 / 66 |
| Reduced motion | solid-sonner's media rule only; `data-motion` ignored | opacity 120ms, y constant, exit y constant |

Unchanged and verified equal to the app: card width 320, padding 12, radius 8, background, elevation, region position (bottom-right 32/48), 16×20 glyph slot, 20×20 close button, 24px buttons, title and description type (13/20, 530 and 440, −0.04px) and colours.

## What a plugin cannot do

`ctx.toast.show` takes `title`, `description`, `variant`, `icon`, `duration`, `persistent`, `actions[{label, run}]`. The app adds no id, class or data attribute to the card and exposes no toast registry or `Toaster` prop. Wrapping `ctx.toast.show` normalises only the wrapping plugin's own calls (each plugin has its own `ctx`), so the card's markup is the only common ground and CSS the only hook that reaches every toast. Found, and not built (each would need a hack):

| Want | Why not | Upstream ask |
|---|---|---|
| A kind hook without `:has()` on a glyph | the class is `toast-v2--{default,success,error,loading}`; no data attribute | `data-kind` or a `className` option |
| Action variants (ghost, contrast) | every button is `neutral`/primary; styled here by position | `actions[].variant` |
| A "Copy details" that keeps the toast open and says "Copied" | every action closes the toast | `actions[].keepOpen` or `dismiss: false` |
| Update a toast in place (a count, a label) | an equal toast replaces; a changed one stacks | `handle.update()` or an id |
| Persistent cards ahead of transient ones | solid-sonner orders by time | `priority` |
| `role="alert"` for error and waiting requests | no role on the card; a MutationObserver could add it, which is DOM injection into app-owned nodes | `kind` / `role` option |
| Swipe right | `swipeDirections` is a `Toaster` prop; today only down dismisses (also a persistent card, with no rubber band) | the prop, exposed |
| One glyph shape for the app's success (`check`) and ours (`circle-check`) | the glyph is a `<use href>`; swapping needs a CSS mask copy of the artwork | success icon default |
| Any glyph on the app's plain error, default and loading toasts | none is drawn in 2.2.5 | — |

## Probe

`src/host-markup.ts` is the only file that names the app's markup (`style.test.ts` fails if another file does). `test/markup-probe.mjs` runs against a live harness: every selector in `PROBES` matches a toast shaped for it; the style is applied (font, 0.28s, −8px peek, the chip); a toast shaped the way the app raises its own and one the notifications hub raises render the shared parts identically (card, title, description, actions, button, close: computed styles; glyph slot and colour); every glyph is the app's neutral colour. Without the plugin it fails the style checks (checked). A real toast raised by the app's own code was not triggered in the harness (the plugin API's toast is the same component, and the probe shapes its toast like the app's: no glyph, or the success check).

## Performance

`perf.mjs` against the bare app and the null plugin: idle script +0 to −4ms, 0 long tasks, 0 MutationObserver callbacks, 0 timers; hover +2ms script. PASS. The plugin has no code that runs after `setup`.
