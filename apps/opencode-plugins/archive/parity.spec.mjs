// Parity spec for the Archived rows and the Archive row action, against the live session row.
// Harness: sidebar-repos + snooze + archive loaded, Side tabs on, three seeded top-level sessions: one open (the native
// sibling), one archived, one snoozed (see the hand-off for how they are made). Every group is opened in `prepare`.
// Run: OC_PW_ROOT=/private/tmp/agents-live-pw OC_HARNESS_CDP_PORT=<port> node apps/opencode-plugins/.claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/archive/parity.spec.mjs

const LIVE = "[data-tab-key]:not([data-tab-key^=draft])"
const nativeRow = `${LIVE} [data-titlebar-tab]`
const archivedRow = "#sa-group-archived [data-titlebar-tab]"

// The live row is first in the list and the only one; ours sit one per group. The host's 2px upward hit extension
// applies to a link only when another slot precedes it.
const FIRST_ROW = { "link.height": "first row in its list: no preceding slot, so the host's 2px upward hit extension does not apply", "link.dy": "same" }

const rowParts = {
  link: "[data-slot=tab-link]",
  avatar: "[data-slot=project-avatar-slot]",
  surface: "[data-slot=project-avatar-surface]",
  badge: "[data-sidebar-repo]",
  title: "[data-slot=tab-title]",
  close: "[data-slot=tab-close]",
}

const openGroups = `
  for (const b of document.querySelectorAll("[data-sa-toggle] button")) if (b.getAttribute("aria-expanded") !== "true") b.click();
`
// The native sibling must be as inactive as ours: the draft tab is the current one. The link's own mousedown (ours
// opens an archived session, the native one its session) navigates away, so checks that press it return here.
const toDraft = `document.querySelector('[data-tab-key^=draft] [data-slot=tab-link]')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));`

export default {
  name: "archive",
  prepare: openGroups + toDraft,
  elements: [
    {
      name: "archived-row",
      ours: archivedRow,
      native: nativeRow,
      parts: rowParts,
      focusTarget: "[data-slot=tab-link]",
      style: { states: ["rest", "row", "hover", "focus"] },
      allow: { ...FIRST_ROW },
      motion: [{ name: "action-reveal", target: "[data-slot=tab-close] button", from: "rest", to: "row", props: ["opacity"], duration: 300 }],
      behaviour: [
        { name: "link-events", check: "event-contract", target: "[data-slot=tab-link]", events: ["pointerdown", "mousedown", "click", "dblclick", "dragstart", "contextmenu"], after: toDraft },
        { name: "link-aria", check: "aria", target: "[data-slot=tab-link]" },
        { name: "tab-order", check: "tab-order", expect: { stops: ["a[tab-link]:0", "button:0"] }, only: "ours" },
        { name: "link-focus-visible", check: "focus-visible", target: "[data-slot=tab-link]" },
        { name: "action-hover-reveal", check: "hover-reveal", target: "[data-slot=tab-row-action] button", only: "ours", expect: { rest: "0", row: "1", hover: "1" } },
        { name: "action-label", check: "scenario", only: "ours", steps: [], probe: "const b = el.querySelectorAll('[data-slot=tab-close] button'); return [b.length, el.querySelector('[data-slot=tab-row-action] button')?.getAttribute('aria-label')]", expect: { result: [1, "Restore Seeded long session"] } },
        { name: "context-menu", check: "scenario", only: "ours", steps: [], probe: "el.querySelector('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 })); const items = [...document.querySelectorAll('[data-sa-popup] [role=menuitem]')].map((i) => i.textContent); document.querySelector('[data-sa-popup]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return items", expect: { result: ["Restore", "Delete…"] } },
        { name: "middle-click", na: "auxclick on the native row closes that tab; an archived row has no tab to close, and the library's onAuxClick is unit-tested" },
        { name: "dblclick-rename", na: "renaming edits the host's session title through its store; an archived row is not a host tab" },
        { name: "drag-sort", na: "library rows are not sortable and never carry the tab list's attributes; dragstart is prevented like the host's link (event contract above)" },
        { name: "hover-preview", na: "the host's session-tab-popover previews a host session after a hover delay; an archived session is not mounted" },
      ],
    },
    // The live row's X is replaced by our action on every host tab, so the native sibling is the X of the draft tab.
    ...[
      ["row-action-archived", `${archivedRow} [data-slot=tab-row-action] button`, "Restore <title>"],
      ["row-action-live-tab", `${LIVE} [data-slot=tab-row-action] button`, "Archive <title>"],
    ].map(([name, ours, label]) => ({
      name,
      ours,
      native: "[data-tab-key^=draft] [data-slot=tab-close] button",
      row: "[data-titlebar-tab]",
      style: { states: ["rest", "row", "hover", "focus", "active"] },
      allow: {
        "row.height": "the draft tab is a one-line 28px row; these rows carry the second line (52px, equal to the live row, checked in archived-row)",
        "events.mousedown": "the draft tab's own close button prevents mousedown; the library X, which is this button, matches the live X (native-ui spec, tab-close-button: mousedown PASS)",
        "events.contextmenu": "a right-click on the action opens this row's own menu (or the host's, on a live tab), so it is prevented or not as that menu requires; the draft X opens none",
        "aria.aria-label": `${label} against Close tab: the action is not close`,
      },
      motion: [{ name: "reveal", from: "rest", to: "row", props: ["opacity"], duration: 300 }],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        { name: "aria", check: "aria" },
        { name: "focus-visible", check: "focus-visible" },
      ],
    })),
  ],
}
