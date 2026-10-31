# Native parity: proving a plugin's UI matches the host

A UI change is done when `scripts/parity.mjs` reports PASS on style, motion and behaviour against the named native sibling, and the report plus its side-by-side screenshot are in the hand-off. Every N/A carries a written reason. "Matches by eye" is not a verdict.

## Why this exists

Shipped plugins looked native and were not. The Archive hover button sat at opacity 1 at rest where the X sits at 0, transitioned `all` where the X transitions `none`, and had no row ancestor, so the host's reveal never applied. An archived row was 45px against the live row's 52px, its link padded `0 6px` against `2px 6px 0`, line-height 16 against 24, and its second line was a 13px muted line where the live row shows an 11px/14px badge above the title. None of this was caught because:

- The rule said "use the app's primitives" and nothing verified it. `ctx.ui` has no tab row, menu item, avatar or spinner, so rows were approximated from memory and classes copied by eye.
- The icon button's size and variant were chosen, not read from the X they sat next to.
- Verification ran against fixtures, never a live row next to a native one.
- In the skill, the primitives rule was one of ten flat bullets; the live-UI steps said "when you can" and "report tests separately"; nothing named a bar to clear, so each run decided for itself.

Parity replaces the preference with a measurement.

## Workflow

1. Name the native sibling before building: the host element the new UI must be indistinguishable from (table below). Build from [native-ui](native-ui.md) or the host source for it.
2. Start the harness ([browser-testing.md](browser-testing.md)) with the plugin loaded beside a seeded session, so the sibling exists on screen.
3. Write `parity.spec.mjs` in the plugin package: one element per shipped UI piece, `ours` and `native` selectors, parts, states, motion, behaviour checks. Copy `apps/opencode-plugins/native-ui/parity.spec.mjs` as the pattern.
4. Run it; fix the plugin until every FAIL is gone. A difference that is by design (a different label, a longer list) becomes an `allow` with its reason; a sibling that cannot exist in the harness (no busy session) becomes `na` with its reason.
5. Hand off `report.md`, the per-element `side-by-side.png`, and the PASS/FAIL/N-A line.

```sh
OC_PW_ROOT=/private/tmp/agents-live-pw OC_HARNESS_CDP_PORT=9348 \
  node .claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/<plugin>/parity.spec.mjs
# one element while iterating:            --only session-tab-row,menu-item
# a one-off style diff with no spec:      --ours '[data-my-row]' --native '[data-titlebar-tab]' --states rest,row,hover
```

Output lands in `/private/tmp/oc-parity/<spec name>/`: `report.md`, `report.json`, and per element `style.json`, `side-by-side.png`, `motion-*.json` with a filmstrip. Exit code 1 on any FAIL.

## What the three layers measure

- **style**: computed properties and boxes of the element and each part, in the states rest, row (pointer on the row, off the element), hover, focus (after a key press, so `:focus-visible` applies) and active, with a 0.5px tolerance. Insets from the row end are compared, so a button in the wrong slot fails on position, not only on size.
- **motion**: transition and animation declarations, `getAnimations()`, and per-frame samples of a property while a state change plays, normalised to the first changed frame; re-run under reduced motion.
- **behaviour**: the same script run on both sides and diffed. Event contract (which of pointerdown, mousedown, click, dblclick, auxclick, dragstart, contextmenu reach the document and whether they are prevented), ARIA and data attributes, tab order, hover reveal, focus-visible outline, keys, menu shape (item variants, submenus, separators, highlight on ArrowDown, Escape and where focus lands), tooltip, and free scenarios (steps then a probe, with `expect` when one side cannot share the contract).

The spec format is documented at the top of `scripts/parity.mjs`.

## What it found on native-ui (real runs)

The library was built from the host source and still failed first time. Fixed before the final run:

| found by | ours → native |
|---|---|
| link aria | `tabindex="0"` → none (the host link is not a tab stop) |
| X event contract | `contextmenu` prevented, `pointerdown` stopped → both reach the document |
| menu aria | root `tabindex=-1` with `aria-label` and a `desktop-app-menu` class (400px wide, 13px items) → `tabindex=0`, no class (440px, 24px items) |
| menu shape | `div[role=separator]` after the critical item → `hr` before it |
| menu hover | items not hit-testable (mount under `contain: strict`) → portalled into `<body>` |
| menu items | no roving tabindex, `aria-disabled` missing → highlighted item `tabindex=0`, others `-1`, `aria-disabled` always set |
| popover card | background 255 vs 250, row padding 36px vs 8px, flat shadow → `.session-summary-popover` class, under which the host scopes its details CSS |
| header button | `pointerdown` not prevented → prevented, as Kobalte's trigger |

Final numbers, native-ui spec against OpenCode 2.2.5 in the harness: full run 2679 PASS, 1 FAIL, 34 N/A. The one FAIL (expanded header button, rest background 0 vs 0.04) was a tool bug, the element's `prepare` skipped when the trigger pre-existed; after the fix the targeted rerun of header-icon-button, header-icon-button-expanded and popover reported 346 PASS, 0 FAIL, 6 N/A. Every N/A is an `allow` or `na` with its reason in the report (first-row hit extension, label text, list length, Kobalte's positioning wrapper, no busy or unread seeded session).

## Shipped elements and their native sibling

| plugin | element | native sibling | parity spec |
|---|---|---|---|
| sidebar-repos | repo badge under the title | none in the host; the row's own title line (second line in its language) | none yet |
| sidebar-repos | status icons | `[data-slot=tab-status]` marks | none yet |
| snooze-archive | hover action (Snooze/Archive) | the row's X (`TabRowAction` sibling) | none yet: was opacity 1 at rest, `transition: all`, no row ancestor |
| snooze-archive | items in the tab menu, Snooze submenu | native `menu-v2-item`, submenu item with chevron | none yet |
| snooze-archive | snoozed/archived group rows and header | sidebar session row and the host's group heading | none yet: 45px vs 52px, padding, line-height, badge placement |
| snooze-archive | time menu | `menu-v2-content` compact | none yet |
| snooze-archive | Custom dialog | `ctx.ui.Dialog` size fit, `Button`, `IconButton`, `TextInput` | none yet |
| agents-panel | header toggle button | Session details button (`HeaderIconButton`) | none yet |
| agents-panel | floating popover | Session details popover (`Popover` + `SummaryCard`) | none yet |
| agents-panel | agent rows | `menu-v2-item` compact | none yet |
| message-jump | pill with IconButtons | composer pill, `ghost-muted small` | none yet |
| visual-replies | card and buttons | `tool-part-wrapper` card, `IconButton` | none yet |
| no-project | command only | `Command` registry (no UI) | not applicable |
| sidepanel | `ctx.ui.Button` | host `Button` | not applicable (host component as is) |
| model-picker | results pane (rows, headers, containers) | the host's own list in the same dialog | `apps/opencode-plugins/model-picker/parity.spec.mjs` (717 PASS, 0 FAIL, 2 N/A) |
| native-ui | every component | see [native-ui.md](native-ui.md) | `apps/opencode-plugins/native-ui/parity.spec.mjs` |

A "none yet" row means the plugin shipped before parity existed and its next UI change starts by writing its spec.
