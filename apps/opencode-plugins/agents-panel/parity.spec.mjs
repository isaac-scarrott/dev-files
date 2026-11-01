// Parity spec for the agents-panel dock window (and its header button) against the native siblings in the harness
// window: right side panel CLOSED, Panel mode on, the dock shown, one session open with running rows.
// Run: OC_PW_ROOT=... OC_HARNESS_CDP_PORT=<port> node .claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/agents-panel/parity.spec.mjs

const DOCK = "[data-agents-dock] > [data-component=menu-v2-content]"
const TOGGLE = "[data-agents-toggle] button"
const TAB_LINK = "[data-tab-key]:not([data-tab-key^=draft]) [data-slot=tab-link]"
const NATIVE_MENU = "[role=menu][data-component=menu-v2-content]"

const showDock = `
  const own = document.querySelector(${JSON.stringify(TOGGLE)});
  if (own.getAttribute("aria-expanded") !== "true") own.click();
`
// The menu opens at a fixed point, independent of the tab link's box. The host's tab context menu is the nearest native menu surface a harness window can show (the composer's background
// activity menu needs a running subagent, which no model can start here).
const openNativeMenu = `
  ${showDock}
  if (!document.querySelector(${JSON.stringify(NATIVE_MENU)})) {
    const link = document.querySelector(${JSON.stringify(TAB_LINK)});
    link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 600, clientY: 300 }));
  }
`
const closeNativeMenu = `document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));`

export default {
  name: "agents-panel",
  viewport: "2000x1190",
  elements: [
    {
      name: "dock-surface",
      ours: DOCK,
      native: NATIVE_MENU,
      persistent: true,
      prepare: openNativeMenu,
      cleanup: closeNativeMenu,
      allow: {
        "width": "the window is a fixed 288px card beside the chat; the menu sizes to its items",
        "height": "list length differs from the menu's three items",
        "overflow": "the window scrolls its list past its max height",
        "icon": "the window holds row icons; the tab menu's items carry none",
      },
      style: { states: ["rest"] },
    },
    {
      name: "dock-row",
      ours: { selector: "[data-agents-dock] [data-agents-row]", index: 0 },
      native: { selector: `${NATIVE_MENU} [data-component=menu-v2-item]`, index: 0 },
      row: "[data-component=menu-v2-item]",
      persistent: true,
      prepare: openNativeMenu,
      cleanup: closeNativeMenu,
      allow: {
        "aria.role": "a row opens a session and stops it with its X: role=button, not menuitem",
        "aria.tabindex": "rows are always tab stops (Enter opens, Delete stops); menu items roam",
        "width": "the row fills its container: a 288px window against the tab menu's 156px",
        "box.width": "same",
        "icon": "a row leads with the spinner or a console icon; the tab menu's items carry none",
        "hover.changed-props": "the host highlights an item from Kobalte's pointer handler before the first sampled frame; both declare no transition (decl rows) and the hover style state matches",
      },
      style: { states: ["rest", "hover", "focus"] },
      motion: [{ name: "hover", from: "rest", to: "hover", props: ["background-color", "color"], duration: 300 }],
      behaviour: [{ name: "aria", check: "aria", attrs: ["data-component", "role", "tabindex"] }],
    },
    {
      name: "dock-toggle",
      ours: TOGGLE,
      native: 'button[aria-label="Toggle review"]',
      prepare: `const o = document.querySelector("[data-agents-toggle] button"); if (o.getAttribute("aria-expanded") === "true") o.click(); const t = document.querySelector('button[aria-label="Toggle review"]'); if (t.getAttribute("aria-expanded") === "true") t.click();`,
      cleanup: `const o = document.querySelector("[data-agents-toggle] button"); if (o.getAttribute("aria-expanded") !== "true") o.click();`,
      allow: {
        "row.inset-end": "the toggle sits before the host's own header buttons, as its other siblings do",
        "aria.aria-label": "its own label (Subagents) against 'Toggle review'",
        "aria.aria-controls": "its own panel id",
      },
      style: { states: ["rest", "hover", "focus", "active"] },
      motion: [{ name: "hover", from: "rest", to: "hover", props: ["background-color", "color"], duration: 300 }],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        { name: "aria", check: "aria", attrs: ["aria-expanded", "aria-label", "aria-controls", "data-component", "data-size", "data-variant", "type"] },
        { name: "focus-visible", check: "focus-visible" },
        { name: "tooltip", check: "tooltip" },
      ],
    },
    {
      name: "dock-toggle-pressed",
      // The host's Toggle review swaps to an active icon instead of filling the button, and the catalog has no active
      // bullet-list; the filled pressed look is the Session details trigger's, open here with its popover.
      ours: TOGGLE,
      native: 'button[aria-label="Session details"]',
      persistent: true,
      prepare: `${showDock} const d = document.querySelector('button[aria-label="Session details"]'); if (d.getAttribute("aria-expanded") !== "true") d.click();`,
      cleanup: `const d = document.querySelector('button[aria-label="Session details"]'); if (d.getAttribute("aria-expanded") === "true") d.click();`,
      allow: {
        "row.inset-end": "the toggle sits before the host's own header buttons",
        "aria.aria-label": "its own label (Subagents) against 'Session details'",
        "aria.aria-controls": "the dock's own id",
        "aria.aria-haspopup": "the docked toggle controls a persistent window, not a popup",
        "focus.color": "the host's details popover closes when the harness moves focus, leaving its trigger unpressed; ours stays pressed while the dock is shown",
        "focus.outline": "same",
        "focus.icon.color": "same",
        "active.background-color": "same",
        "aria.aria-expanded": "same",
      },
      style: { states: ["rest", "hover", "focus", "active"] },
      behaviour: [{ name: "aria", check: "aria", attrs: ["aria-expanded", "aria-label", "aria-controls", "aria-haspopup", "data-component", "data-size", "data-variant", "type"] }],
    },
    {
      name: "dock-chat-shift",
      ours: "[data-slot=session-chat-panel]",
      native: "[data-slot=session-chat-panel]",
      na: "the same chat panel moves for both siblings (the dock and the host's review panel), so the spec's open/close hook cannot tell the sides apart; the shift is sampled per frame against the review panel and the sidebar in the hand-off instead",
    },
    {
      name: "header-badge",
      ours: "[data-agents-badge]",
      native: "[data-component=tag][data-variant=accent]",
      na: "no accent tag exists in the harness to measure: the host shows one only as the sidebar toggle's unread dot (needs an unread session) and its Badge only neutral in Settings; the badge is the host's own tag markup (data-component=tag, data-variant=accent) so badge.css styles it, and the harness check read 16px height, 4px padding, 2px radius, 11px/530 tabular, bg-accent on text-contrast, light and dark",
    },
  ],
}
