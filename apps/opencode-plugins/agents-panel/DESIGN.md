# agents-panel

## Mode

The header button and popover exist only while the **Panel** mode is on. The mode is a global plugin store (`mode.enabled`, default `false`), so existing users see nothing new until they choose it.

The choice lives in the host's own select: Settings → Timeline → Background activity (`[data-action="settings-background-activity"]`), as a fifth option after Right.

## Why DOM injection

- `SettingsPage` can only add a page, a section on General/Servers, or rows in the General section. There is no hook for the Timeline section and none for a select's options.
- The host stores `general.backgroundActivity` as a closed enum (`off | left | center | right`) in `settings.v3`, written through the host's own store. A plugin cannot write it, and an unknown value would fail validation. So the mode is never written there.
- A plugin-owned row under the native one is not possible either (rows land in General, not directly under Timeline).

## How it works (`src/setting.ts`)

- A `MutationObserver` (childList, one `requestAnimationFrame` per burst) finds the Kobalte listbox `<root id>-listbox` when the popup opens and appends a clone of the host's `center` option: same `menu-v2-item` markup, so hover, highlight, check and height come from the host's CSS.
- Picking it commits the host's own **Hidden** (synthetic `pointerup` + `click` on that option, which selects and closes the popup), then sets `mode.enabled`.
- Picking any host option, Hidden included, sets `mode.enabled = false` (capture-phase `pointerup`/Enter/Space on host options). The host value is then whatever the user picked, so "restoring" the previous value is the user's own pick.
- While on, the host select still holds `off`. CSS hides its value text and the check on its Hidden option; a sibling value span (cloned from the host's) and our selected option show the mode instead.
- If the host list shows a selected value other than `off` while the mode is on (changed elsewhere), the mode ends.
- Keyboard: Kobalte's collection does not know our option, so ArrowDown past Right and ArrowUp from ours are handled here; Enter/Space pick it.

## Limits

- The popup is not rendered while closed, so the reconcile above runs only when it is open. A host value changed while the settings page is closed leaves the mode on with a visible native row until the dropdown is next opened.
- Opening the dropdown while the mode is on highlights Hidden first (the host's selected item), with the check on ours.
- The native row above the composer was verified by the select's state (Hidden) only; no model can run a subagent in the harness.

## Dock

The dock follows the **right side panel** (the host's side region: review, files, browser, terminal; toggled by the header button next to the session details, `⇧⌘R`, or the "Toggle review" command). With it **closed** the header button shows and hides a persistent floating window. With it **open** nothing changes from before dock mode: the button opens the popover, there is no window and the chat is not shifted.

**Earlier misreading.** Dock mode was first keyed on the *left* tab sidebar (`aside[data-slot=vertical-tabs-sidebar]`, with data-state/rect/ResizeObserver detection and `data-agents-sidebar`/`data-agents-aside-width` diagnostics) because "the sidebar" was taken to mean it. The user meant the right panel, which is why it never matched what they saw. All left-sidebar detection is removed; the left sidebar makes no difference (verified open and closed).

- **Panel state**: the official reactive API, `ctx.layout.side.opened(session)` (SDK `Layout.side`; the host's answer is `!!tabs.region(shellTab(session), "side")`, per session, so it is per window and per tab). No DOM observer. It is true for every tab kind (review, files, browser, terminal, + menu). Opening it narrows the chat card (measured at 2000px: card 284-1700 becomes 284-884, panel 892-1700).
- **Narrow**: below 900px window width the chat has no room beside a 288px window, so the button is popover mode (listener on `resize`, `NARROW_BELOW` in `toggle.tsx`).
- **Diagnostics**: the toggle's wrapper carries `data-agents-mode` (`window`|`popover`) and `data-agents-side` (`open`|`closed`).
- **Window**: an elevated surface (the host's `menu-v2-content`) drawn inside the chat card, 288px, anchored 8px from the card's end edge and 56px below its top (under the header row), clipped by the card's rounded corners. It is `position: absolute` in the card, which is the first child of `[data-slot=session-chat-panel]` and already `relative overflow-hidden`; Portal's wrapper div is `display: contents`, so the card's flex layout, the timeline's scroll and virtualizer, and the other header buttons are untouched. Mounted only while shown or leaving; it opens a frame after mounting so the entrance transitions. The host's Toggle review button sits outside the card at its end corner and stays above the window. When the host's review panel is open it sits beside the card, and the window stays inside the card.
- **Chat centring**: while shown, `--agents-dock-pad` (window width + its 8px inset) is set on `<html>`; it is a registered `<length>` property transitioned 250ms on the host's curve. It is reserved as end padding on the timeline's scroll viewport and on the composer's full-width wrapper, so messages and composer re-centre in the free width while the scrollbar stays on the card edge. The header sits inside that viewport (`.sticky`), so it is widened by the same variable and does not move (0px delta, also mid-animation). The timeline column keeps its width: no reflow, no scroll jump.
- **Layout**: the window's height fits its content up to `min(420px, card height - 64px)`; the menu surface scrolls inside it. The list panel sets `max-height: none; overflow: visible` because it otherwise inherited a percentage max-height and collapsed to its heading (rows empty while the count read "N running").
- **Hiding**: the window has no close button. The header Subagents button is the only way to show or hide it, besides the panel rule.
- **Choice**: `dock.visible`, a global plugin store, default hidden. Opening the right panel (button, `⇧⌘R` or command) while the window is visible hides it (animated out, chat re-centres) and stores hidden, without opening the popover; closing the panel does not bring it back, the user toggles it with the button.
- **Motion**: window 250ms transform + 150ms opacity, chat 250ms; reduced motion drops movement (opacity stays, the chat re-centres instantly).
- **Not built**: dragging and resizing. The window does not shrink the chat below the host's own flex limits on a very narrow window.
- **One list**: the heading count, the rows and the empty state all read the same memo (`createSubagents`), so they cannot disagree in a reactive pass. The sessions list, family, status and background tasks sync at different times; each is a reactive read inside that memo, so rows and count appear together as each arrives (tested with data arriving late and retracting). The host exposes no call to sync children, only the reactive stores. The "N running, no rows" seen in the real app was the list panel collapsing to its heading (see Layout), not a data filter.
