# agents-panel

## Mode

The header button and popover exist only while the **Subagents panel** mode is on. The mode is a global plugin store (`mode.enabled`, default `false`), so existing users see nothing new until they choose it.

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
