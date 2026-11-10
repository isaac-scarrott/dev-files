// Parity spec for the Snoozed rows and their row action, against the live session row.
// Harness: sidebar-repos + snooze + archive loaded, Side tabs on, three seeded top-level sessions: one open (the native
// sibling), one archived, one snoozed (see the hand-off for how they are made). Every group is opened in `prepare`.
// Run: OC_PW_ROOT=/private/tmp/agents-live-pw OC_HARNESS_CDP_PORT=<port> node apps/opencode-plugins/.claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/snooze/parity.spec.mjs

const LIVE = "[data-tab-key]:not([data-tab-key^=draft])"
const nativeRow = `${LIVE} [data-titlebar-tab]`
const snoozedRow = "#sa-group-snoozed [data-titlebar-tab]"

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
// The native sibling must be as inactive as ours: the draft tab is the current one.
const toDraft = `document.querySelector('[data-tab-key^=draft] [data-slot=tab-link]')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));`

export default {
  name: "snooze",
  prepare: openGroups + toDraft,
  elements: [
    {
      name: "snoozed-row",
      ours: snoozedRow,
      native: nativeRow,
      parts: rowParts,
      focusTarget: "[data-slot=tab-link]",
      style: { states: ["rest", "row", "hover", "focus"] },
      // Snoozed ends its second line with the time until wake, which the live row does not have.
      allow: { ...FIRST_ROW, "badge.display": "Snoozed only, by request: the second line is a flex row so the time until wake stays whole while repo and branch truncate; the live line is a block" },
      behaviour: [
        { name: "link-events", check: "event-contract", target: "[data-slot=tab-link]", events: ["pointerdown", "dblclick", "dragstart", "contextmenu"] },
        { name: "link-aria", check: "aria", target: "[data-slot=tab-link]" },
        { name: "tab-order", check: "tab-order", expect: { stops: ["a[tab-link]:0", "button:0"] }, only: "ours" },
        { name: "action-label", check: "scenario", only: "ours", steps: [], probe: "return el.querySelector('[data-slot=tab-row-action] button')?.getAttribute('aria-label')", expect: { result: "Wake Seeded long session" } },
        { name: "context-menu", check: "scenario", only: "ours", steps: [], probe: "el.querySelector('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 })); const items = [...document.querySelectorAll('[data-sa-popup] [role=menuitem]')].map((i) => i.textContent); document.querySelector('[data-sa-popup]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return items", expect: { result: ["Wake", "Archive", "Delete…"] } },
        { name: "mousedown-click", na: "mousedown and click on a Snoozed link wake the session (the row leaves the list); the wake path is covered by the unit test, so the contract run above leaves them out" },
        { name: "middle-click", na: "auxclick on the native row closes that tab; a snooze row has no tab to close, and the library's onAuxClick is unit-tested" },
        { name: "dblclick-rename", na: "renaming edits the host's session title through its store; a snoozed row is not a host tab" },
        { name: "drag-sort", na: "library rows are not sortable and never carry the tab list's attributes; dragstart is prevented like the host's link (event contract above)" },
        { name: "hover-preview", na: "the host's session-tab-popover previews a host session after a hover delay; a snoozed session is not mounted" },
      ],
    },
    {
      name: "row-action-snoozed",
      ours: `${snoozedRow} [data-slot=tab-row-action] button`,
      native: "[data-tab-key^=draft] [data-slot=tab-close] button",
      row: "[data-titlebar-tab]",
      style: { states: ["rest", "row", "hover", "focus", "active"] },
      allow: {
        "row.height": "the draft tab is a one-line 28px row; these rows carry the second line (52px)",
        "events.mousedown": "the draft tab's own close button prevents mousedown; the library X, which is this button, matches the live X (native-ui spec, tab-close-button: mousedown PASS)",
        "events.contextmenu": "a right-click on the action opens this row's own menu, so it is prevented or not as that menu requires; the draft X opens none",
        "aria.aria-label": "Wake against Close tab: the action is not close",
      },
      motion: [{ name: "reveal", from: "rest", to: "row", props: ["opacity"], duration: 300 }],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        { name: "aria", check: "aria" },
        { name: "focus-visible", check: "focus-visible" },
      ],
    },
  ],
}
