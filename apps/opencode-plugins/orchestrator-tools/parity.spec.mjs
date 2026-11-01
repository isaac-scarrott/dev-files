// Parity spec for the peer-message row against the host's own rows in the same timeline: the background-subagent row
// (`task-tool-surface`) for the row, the Questions disclosure (`collapsible-arrow`) for the arrow.
// Needs a harness session with an answered Questions row, a background subagent row and peer messages delivered through
// send_message's real path (DESIGN.md, "Peer card"). Run from the repo root:
//   OC_PW_ROOT=/private/tmp/pw OC_HARNESS_CDP_PORT=<port> node ~/.config/opencode/skills/opencode-gui-plugins/scripts/parity.mjs \
//     --spec apps/opencode-plugins/orchestrator-tools/parity.spec.mjs

const scroll = `(async () => { const v = document.querySelector("[data-slot=session-timeline-scroll] .scroll-view__viewport"); v.scrollTop = v.scrollHeight; await new Promise((r) => setTimeout(r, 400)) })()`

const ROW = "[data-peer-card][data-expandable=true]"
const both = (reason, ...names) => Object.fromEntries(["rest", "hover"].flatMap((state) => names.map((name) => [`${state}.${name}`, reason])))

export default {
  name: "orchestrator-tools-peer-row",
  viewport: "1300x1500",
  prepare: scroll,
  elements: [
    {
      name: "peer-row",
      ours: ROW,
      native: "[data-component=task-tool-surface]",
      row: "[data-peer-card], [data-component=task-tool-surface]",
      parts: { icon: "[data-slot=peer-dir]", title: "[data-slot=peer-name], [data-component=task-tool-title]", text: "[data-slot=peer-text], [data-slot=basic-tool-tool-subtitle]" },
      style: { states: ["rest", "hover"] },
      allow: {
        ...both("both rows are fit-content; the width follows each one's own words and ours fills the column when the message is long", "width", "box.width", "text.width", "title.width"),
        ...both("the card's own colour, weight and line height are never drawn: its title (530) and text (440, 20px) parts match, and the host's surface only seeds the colour of its trailing chevron", "color", "font-weight", "line-height", "outline"),
        ...both("ours leads with the direction icon (16px + 8px gap), the host's row has no leading icon", "title.dx", "text.dx"),
        ...both("ours truncates a long sender title with an ellipsis (host titles are short fixed words)", "title.overflow", "title.text-overflow"),
        ...both("the ellipsis of ours is on the first paragraph (line-clamp), so Markdown blocks below stay clipped; the host's subtitle is plain text", "text.text-overflow"),
        ...both("the host row has no leading icon; ours is measured against the host chevron beside it (16px, rgb 128 = text-faint), which passes", "icon"),
        ...both("ours is a button-backed row whose pointer is shown only when there is something to expand", "cursor"),
      },
    },
    {
      name: "peer-arrow",
      ours: `${ROW} [data-slot=peer-arrow]`,
      native: "[data-slot=collapsible-arrow]",
      row: "[data-peer-card], [data-slot=collapsible-trigger]",
      style: false,
      motion: [{ name: "arrow-reveal", from: "rest", to: "row", props: ["opacity"], duration: 400 }],
      behaviour: [{ name: "arrow-reveal-on-hover", check: "hover-reveal" }],
    },
    {
      name: "open-session-button",
      ours: `${ROW} .peer-open`,
      native: "[data-slot=basic-tool-action] button",
      na: "the host's ghost action button (24px, radius 6px, hover-revealed) only exists inside an opened Execute tool part, which the seeded session does not have; ours is measured against its audited values in DESIGN.md instead",
    },
  ],
}
