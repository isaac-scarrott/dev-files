// Parity spec for the native-ui library: every component next to its native sibling in the harness window, with the
// demo plugin (./demo, built with `vite build` after `pnpm install` there) loaded beside sidebar-repos and
// snooze-archive and two seeded sessions open (scripts/seed-session.mjs; the keys below are theirs).
// Run: OC_PW_ROOT=... OC_HARNESS_CDP_PORT=9348 node apps/opencode-plugins/.claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/native-ui/parity.spec.mjs

const LIVE = "[data-tab-key]:not([data-tab-key^=draft])"
// The native sibling is the first seeded session's row, named by key so re-opening a tab (which appends it) cannot
// swap it for the active one. The demo gives this row the sibling action, so its X stays visible.
const SIBLING = '[data-tab-key*="ses_19343c361000yjXl0nHdC0JKeo"]'
const nativeRow = `${SIBLING} [data-titlebar-tab]`
const nativeX = `${SIBLING} [data-slot=tab-close] button`
const nativeLink = `${SIBLING} [data-slot=tab-link]`
const DETAILS = 'button[aria-label="Session details"]'
const NATIVE_MENU = "[role=menu][data-component=menu-v2-content]:not([data-demo-menu] *)"
const OUR_MENU = "[data-demo-menu] [role=menu][data-component=menu-v2-content]"

const rowParts = {
  link: "[data-slot=tab-link]",
  avatar: "[data-slot=project-avatar-slot]",
  surface: "[data-slot=project-avatar-surface]",
  badge: "[data-sidebar-repo]",
  title: "[data-slot=tab-title]",
  close: "[data-slot=tab-close]",
  closeButton: "[data-slot=tab-close] button",
}

// Both context menus open at once: the host's on the sibling row first (so snooze-archive knows which session it
// is extending), then ours without taking focus.
const openMenus = `
  const link = document.querySelector(${JSON.stringify(nativeLink)});
  const b = link.getBoundingClientRect();
  link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: b.x + 40, clientY: b.y + b.height / 2 }));
  window.__nativeUiDemo.openMenu({ x: 400, y: 300 }, { focus: false });
`
const closeMenus = `
  window.__nativeUiDemo.closeMenu();
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
`
const openPopovers = `window.__nativeUiDemo.openPopover({ sticky: true }); document.querySelector(${JSON.stringify(DETAILS)}).click();`
const closePopovers = `window.__nativeUiDemo.closePopover(); const d = document.querySelector(${JSON.stringify(DETAILS)}); if (d.getAttribute("aria-expanded") === "true") d.click();`

const menuItem = (name, ours, native, extra = {}) => ({
  name,
  ours,
  native,
  row: "[data-component=menu-v2-item]",
  persistent: true,
  prepare: openMenus,
  cleanup: closeMenus,
  style: { states: ["rest", "hover", "focus"], ...extra.style },
  behaviour: [{ name: "aria", check: "aria", attrs: ["role", "tabindex", "data-component", "data-appearance", "data-variant", "aria-haspopup", "aria-disabled"] }],
  ...extra,
})

// The two seeded sessions the harness opened; a check that navigates (the link's own mousedown) or closes a tab is
// undone by re-opening them through the router and re-activating the second.
const SESSIONS = ["ses_19343c361000yjXl0nHdC0JKeo", "ses_19354fc93000RZ4lc2l2DR4uBZ"]
const restoreTabs = `
  for (const id of ${JSON.stringify(SESSIONS)}) {
    if (document.querySelector('[data-tab-key*="' + id + '"]')) continue;
    const a = document.createElement("a"); a.href = "/server/c2lkZWNhcg/session/" + id; document.body.append(a); a.click(); a.remove();
  }
  const second = document.querySelector('[data-tab-key*="${SESSIONS[1]}"] [data-titlebar-tab]');
  if (second && second.dataset.active !== "true") {
    const a = document.createElement("a"); a.href = "/server/c2lkZWNhcg/session/${SESSIONS[1]}"; document.body.append(a); a.click(); a.remove();
  }
`

export default {
  name: "native-ui",
  prepare: restoreTabs,
  elements: [
    {
      name: "session-tab-row",
      ours: "[data-demo-row=live-twin]",
      native: nativeRow,
      parts: rowParts,
      focusTarget: "[data-slot=tab-link]",
      // The host extends a link's hit box 2px upward only when another slot precedes it ([data-titlebar-tab-slot]+[data-titlebar-tab-slot]);
      // this twin is the first row of its list, as the host's own first tab is. archived-row below, a middle row, carries the full box.
      allow: { "link.height": "first row in its list: no preceding slot, so the host's 2px upward hit extension does not apply", "link.dy": "same" },
      style: { states: ["rest", "row", "hover", "focus"] },
      motion: [{ name: "x-reveal", target: "[data-slot=tab-close] button", from: "rest", to: "row", props: ["opacity"], duration: 300 }],
      behaviour: [
        { name: "link-events", check: "event-contract", target: "[data-slot=tab-link]", events: ["pointerdown", "mousedown", "click", "dblclick", "dragstart", "contextmenu"], after: restoreTabs },
        { name: "link-aria", check: "aria", target: "[data-slot=tab-link]" },
        { name: "tab-order", check: "tab-order", expect: { stops: ["a[tab-link]:0", "button:0", "button:0"] }, only: "native" },
        { name: "tab-order-ours", check: "tab-order", only: "ours", expect: { stops: ["a[tab-link]:0", "button:0"] } },
        { name: "x-hover-reveal", check: "hover-reveal", target: "[data-slot=tab-close] button" },
        { name: "link-focus-visible", check: "focus-visible", target: "[data-slot=tab-link]" },
        // snooze-archive injects Snooze/Archive into whichever tab menu it sees, keyed on the session it last saw right-clicked; a demo row has none, so its items are left out of the shape.
        { name: "context-menu", check: "menu", items: true, ignore: "[data-sa-menu]" },
        { name: "middle-click", na: "auxclick on the native row closes that tab; the event contract above shows both rows let auxclick through unprevented, and the library's onAuxClick is unit-tested" },
        { name: "dblclick-rename", na: "renaming edits the host's session title through its store; a library row has no session, so it exposes onRename and the host's data-editing attribute instead" },
        { name: "drag-sort", na: "the host sorts tabs with Kobalte's sortable on [data-titlebar-tab-list]; library rows are not sortable and never carry that attribute, so dragstart is prevented like the host's own link" },
        { name: "scroll-into-view", na: "the host scrolls the active tab into view from its store; rows below the fold are a list concern, left to the consumer" },
        { name: "hover-preview", na: "the host's session-tab-popover shows a session preview after a hover delay from its store; a library row has no session" },
      ],
    },
    {
      name: "session-tab-list",
      ours: "[data-session-tab-list]",
      native: "[data-titlebar-tab-list][data-orientation=vertical]",
      row: "[data-session-tab-list], [data-titlebar-tab-list]",
      allow: { "box.height": "three demo rows against the host's draft tab plus two rows", "row.height": "same", "box.width": "the host list is the scroll viewport's width; the demo list is a block inside it" },
      style: { states: ["rest"], props: ["display", "flex-direction", "row-gap", "align-items", "padding", "margin"] },
      behaviour: [
        { name: "row-gap", check: "scenario", steps: [], probe: "const [a, b] = el.querySelectorAll(':scope > [data-titlebar-tab-slot]'); return Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom)", expect: { result: 4 } },
      ],
    },
    {
      name: "archived-row",
      ours: "[data-demo-row=archived]",
      native: nativeRow,
      parts: { link: rowParts.link, avatar: rowParts.avatar, surface: rowParts.surface, badge: rowParts.badge, title: rowParts.title },
      focusTarget: "[data-slot=tab-link]",
      style: { states: ["rest", "row", "hover", "focus"] },
      behaviour: [
        { name: "link-aria", check: "aria", target: "[data-slot=tab-link]" },
        { name: "tab-order", check: "tab-order", only: "ours", expect: { stops: ["a[tab-link]:0", "button:0"] } },
        { name: "action-in-close-slot", check: "scenario", only: "ours", steps: [], probe: "const b = el.querySelectorAll('[data-slot=tab-close] button'); return [b.length, b[0]?.getAttribute('aria-label')]", expect: { result: [1, "Delete"] } },
      ],
    },
    {
      name: "tab-close-button",
      ours: "[data-demo-row=live-twin] [data-slot=tab-close] button",
      native: nativeX,
      style: { states: ["rest", "row", "hover", "focus", "active"] },
      motion: [
        { name: "reveal", from: "rest", to: "row", props: ["opacity"], duration: 300 },
        { name: "press", from: "hover", to: "active", props: ["background-color", "opacity", "transform"], duration: 300 },
      ],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        { name: "aria", check: "aria" },
        { name: "focus-visible", check: "focus-visible" },
        { name: "tooltip", check: "tooltip" },
      ],
    },
    {
      name: "tab-row-action-sibling",
      ours: `${LIVE} [data-slot=tab-row-action]:not([data-replace]) button`,
      native: nativeX,
      allow: { "row.inset-end": "a sibling action sits one button inward of the X (28px vs 4px from the row end)", "aria.aria-label": "the action's own label (Snooze) against the X's (Close tab)" },
      style: { states: ["rest", "row", "hover", "focus", "active"] },
      motion: [{ name: "reveal", from: "rest", to: "row", props: ["opacity"], duration: 300 }],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        { name: "aria", check: "aria" },
        { name: "hover-reveal", check: "hover-reveal" },
        { name: "focus-visible", check: "focus-visible" },
        { name: "tooltip", check: "tooltip" },
        { name: "inset", check: "scenario", only: "ours", steps: [], probe: "const row = el.closest('[data-titlebar-tab]').getBoundingClientRect(); return Math.round(row.right - el.getBoundingClientRect().right)", expect: { result: 28 } },
      ],
    },
    {
      name: "tab-row-action-replace",
      ours: `${LIVE} [data-slot=tab-row-action][data-replace] button`,
      native: nativeX,
      allow: { "row.centre-dy": "the active row is measured against the first live row; both centre the button", "aria.aria-label": "the action's own label (Archive) against the X's (Close tab)" },
      style: { states: ["rest", "row", "hover", "focus", "active"] },
      behaviour: [
        { name: "aria", check: "aria" },
        { name: "hover-reveal", check: "hover-reveal" },
        { name: "native-x-hidden", check: "scenario", only: "ours", steps: [], probe: "return getComputedStyle(el.closest('[data-titlebar-tab]').querySelector('[data-slot=tab-close] button')).display", expect: { result: "none" } },
      ],
    },
    {
      name: "menu-content",
      ours: OUR_MENU,
      native: NATIVE_MENU,
      row: "[role=menu]",
      persistent: true,
      prepare: openMenus,
      cleanup: closeMenus,
      parts: { separator: "[data-slot=menu-v2-separator]", chevron: "[data-slot=menu-v2-item-indicator], [aria-haspopup] svg" },
      style: { states: ["rest"], props: ["background-color", "border-radius", "padding", "box-shadow", "min-width", "z-index", "font-size", "display", "flex-direction", "gap", "outline"] },
      behaviour: [
        { name: "aria", check: "aria", attrs: ["role", "tabindex", "data-component", "data-appearance", "aria-label"] },
        { name: "shape", check: "scenario", steps: [], probe: "return [...el.querySelectorAll('[role=menuitem], [data-slot=menu-v2-separator]')].map((i) => i.dataset.slot === 'menu-v2-separator' ? 'sep' : (i.dataset.variant ?? 'item') + (i.getAttribute('aria-haspopup') ? '[sub]' : ''))" },
      ],
    },
    menuItem("menu-item", `${OUR_MENU} [role=menuitem]`, `${NATIVE_MENU} [role=menuitem]`, {
      parts: { content: "[data-slot=menu-v2-item-content]" },
    }),
    menuItem("menu-item-submenu", `${OUR_MENU} [role=menuitem][aria-haspopup]`, `${NATIVE_MENU} [role=menuitem][aria-haspopup]`, {
      parts: { content: "[data-slot=menu-v2-item-content]", chevron: "svg" },
    }),
    menuItem("menu-item-critical", `${OUR_MENU} [role=menuitem][data-variant=critical]`, `${NATIVE_MENU} [role=menuitem][data-variant=critical]`, {
      parts: { content: "[data-slot=menu-v2-item-content]" },
    }),
    {
      name: "menu-separator",
      ours: `${OUR_MENU} [data-slot=menu-v2-separator]`,
      native: `${NATIVE_MENU} [data-slot=menu-v2-separator]`,
      row: "[role=menu]",
      persistent: true,
      prepare: openMenus,
      cleanup: closeMenus,
      style: { states: ["rest"], props: ["height", "margin", "background-color", "border-top", "border-bottom", "width", "opacity"] },
      behaviour: [{ name: "aria", check: "aria", attrs: ["role", "data-orientation", "data-slot", "data-appearance"] }],
    },
    {
      name: "header-icon-button",
      ours: "[data-demo-trigger]",
      native: DETAILS,
      row: ".session-header-actions",
      allow: { "row.inset-end": "the demo button is placed before the host's own header buttons", "aria.aria-label": "the demo button's own label against 'Session details'" },
      style: { states: ["rest", "hover", "focus", "active"] },
      motion: [{ name: "hover", from: "rest", to: "hover", props: ["background-color", "color"], duration: 300 }],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        { name: "aria", check: "aria", attrs: ["aria-haspopup", "aria-expanded", "aria-label", "data-component", "data-size", "data-variant", "type"] },
        { name: "focus-visible", check: "focus-visible" },
        { name: "tooltip", check: "tooltip" },
        { name: "keys", check: "keys", keys: ["Enter", " "] },
      ],
    },
    {
      name: "header-icon-button-expanded",
      ours: "[data-demo-trigger]",
      native: DETAILS,
      row: ".session-header-actions",
      persistent: true,
      prepare: openPopovers,
      cleanup: closePopovers,
      allow: { "row.inset-end": "the demo button is placed before the host's own header buttons" },
      style: { states: ["rest"], props: ["background-color", "color", "opacity", "box-shadow"] },
      behaviour: [{ name: "aria", check: "aria", attrs: ["aria-haspopup", "aria-expanded", "aria-controls", "data-expanded", "data-state"] }],
    },
    {
      name: "popover",
      ours: "[data-native-ui-demo-popover]",
      native: ".session-summary-popover",
      row: "[role=dialog]",
      persistent: true,
      prepare: openPopovers,
      cleanup: closePopovers,
      parts: {
        panel: "[data-component=session-summary-panel]",
        card: ".session-summary-card",
        heading: ".session-summary-heading",
        headingLabel: ".session-summary-heading .session-summary-label",
        row: ".session-service-trigger",
        rowLabel: ".session-service-trigger .session-summary-label",
        count: ".session-service-count",
      },
      allow: {
        "rest.position": "Kobalte positions a fixed wrapper around relative content; the library shell is the fixed box itself (placement is checked below)",
        "box.height": "the host card lists four services, the demo two", "row.height": "same", "panel.height": "same", "card.height": "same",
        "aria.aria-label": "the demo popover's own label against 'Session details'",
      },
      style: {
        states: ["rest"],
        props: ["width", "z-index", "position", "background-color", "border-radius", "padding", "box-shadow", "outline", "opacity", "transition", "animation-name"],
        partProps: ["width", "height", "display", "flex-direction", "gap", "padding", "background-color", "border-radius", "box-shadow", "color", "font-size", "font-weight", "line-height", "cursor", "user-select", "overflow", "text-overflow", "white-space"],
      },
      behaviour: [
        { name: "aria", check: "aria", attrs: ["role", "tabindex", "data-expanded", "aria-label", "id"] },
        { name: "placement", check: "scenario", steps: [], probe: "const b = el.getBoundingClientRect(); const h = document.querySelector('.session-header-actions').getBoundingClientRect(); return { endGap: Math.round(h.right - b.right), topGap: Math.round(b.top - h.bottom), width: Math.round(b.width) }" },
        // Row count and which section is open differ by content; every row's contract (a typed button with aria-expanded and aria-controls) is the same.
        { name: "rows", check: "scenario", steps: [], probe: "return [...new Set([...el.querySelectorAll('.session-service-trigger')].map((r) => [r.tagName, r.getAttribute('type'), r.hasAttribute('aria-expanded'), r.hasAttribute('aria-controls')].join()))]" },
      ],
    },
    {
      name: "summary-row",
      ours: "[data-native-ui-demo-popover] .session-service-trigger",
      native: ".session-summary-popover .session-service-trigger",
      row: ".session-summary-card",
      persistent: true,
      prepare: openPopovers,
      cleanup: closePopovers,
      parts: { label: ".session-summary-label", count: ".session-service-count" },
      allow: { "row.height": "the host card lists four services, the demo two", "row.centre-dy": "the host card lists four services, the demo two" },
      style: { states: ["rest", "hover", "focus"] },
      behaviour: [{ name: "focus-visible", check: "focus-visible" }],
    },
    {
      name: "project-avatar",
      ours: "[data-demo-row=live-twin] [data-component=project-avatar-v2]",
      native: { selector: `${LIVE} [data-component=project-avatar-v2]`, index: 0 },
      parts: { surface: "[data-slot=project-avatar-surface]" },
      style: { states: ["rest"] },
    },
    { name: "progress-spinner", ours: "[data-native-ui-demo-popover] svg", native: "[data-slot=tab-status] svg", na: "no session in the harness is busy, so the host renders no spinner to measure; spinner.tsx is a verbatim copy of the host's ui/components/spinner.tsx and spinner-radar.ts" },
    { name: "snoozed-status-mark", ours: "[data-demo-row=snoozed] [data-mark]", native: `${LIVE} [data-slot=tab-status] [data-mark]`, na: "neither seeded session is unread, so the host renders no status mark; the library row renders the host's own [data-slot=tab-status] markup and classes" },
  ],
}
