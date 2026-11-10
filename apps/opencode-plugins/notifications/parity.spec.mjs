// Parity spec for the tab mark: our mark in the first session tab against the host's own status slot in a plain tab.
// Needs the harness with notifications and sidebar-repos loaded, side tabs, and at least three open session tabs
// (scripts/seed-session.mjs plus a few more imports). The mark is made by publishing one `info` through the hub's sink.
// Run: OC_PW_ROOT=... OC_HARNESS_CDP_PORT=<port> node apps/opencode-plugins/.claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/notifications/parity.spec.mjs

const SESSION_TABS = "[data-tab-key^=sidecar]"
const publish = `
  const sink = globalThis[Symbol.for("opencode-plugins.notify.v1")].sinks[0];
  const tab = document.querySelectorAll(${JSON.stringify(SESSION_TABS)})[0];
  const id = tab.dataset.tabKey.split("/").pop();
  sink.publish({ v: 1, kind: "info", severity: "info", target: { server: "sidecar", session: id }, title: "Monitor ended", source: "monitor", key: "parity", persistent: false, at: Date.now() });
`
const retract = `globalThis[Symbol.for("opencode-plugins.notify.v1")].sinks[0].clear("monitor", "parity")`

export default {
  name: "notifications",
  prepare: publish,
  elements: [
    {
      name: "tab-mark",
      ours: `${SESSION_TABS}:has([data-notify-mark]) [data-notify-mark]`,
      // A plain, inactive session tab: its status slot is the box the host's own marks (unread dot, busy ring) fill.
      native: `${SESSION_TABS}:not(:has([data-notify-mark])):not(:has([data-active=true])) [data-slot=tab-status]`,
      row: "[data-titlebar-tab]",
      style: { states: ["rest", "row", "hover"] },
      allow: {
        color: "severity colour from the host's --v2-state-fg-* tokens; the slot has no colour of its own until a mark fills it",
        outline: "outline-style is none on both: only the unused outline colour (currentColor) differs, nothing is drawn",
      },
      // The mark's glyph is the toast's: same sprite symbol, 14px (the host's small icon, the busy ring's size).
      behaviour: [
        { name: "aria", na: "the host's status slot is aria-hidden decoration; ours is role=img with a label by design, so assistive tech hears what the host only paints" },
      ],
    },
  ],
}
