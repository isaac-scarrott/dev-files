// Parity spec for the composer chips (monitors, schedules) and their popover rows, next to the host's own sibling in the same
// lane: the Background activity capsule ("1 subagent", dithered-grid glyph) and its activity panel. Harness set-up: monitor
// and scheduler loaded, one session open that has a running subagent (a held mock model run), a monitor and a schedule aimed
// at it, Background activity on Left. The chips are the host's own `ComposerPill` capsules, so style parity is the host's CSS
// applying to both; what the spec proves is that nothing in the plugin overrides it and that the popover rows read like the
// host's activity rows.
// Run: OC_PW_ROOT=... OC_HARNESS_CDP_PORT=9341 node .claude/skills/opencode-gui-plugins/scripts/parity.mjs --spec apps/opencode-plugins/native-ui/chip.parity.spec.mjs

const NATIVE = '[data-slot="session-activity-chip"]'
const MONITOR = '[data-slot="session-plugin-pill"][aria-label*="monitor"]'
const SCHEDULE = '[data-slot="session-plugin-pill"][aria-label*="schedule"]'
const NATIVE_PANEL = '[data-slot="session-activity-panel"]'
const OUR_PANEL = "[data-composer-pill-panel]"

const STATES = ["rest", "hover", "focus", "active", "row"]
const each = (keys, why) => Object.fromEntries(STATES.flatMap((state) => keys.map((key) => [`${state}.${key}`, why])))
const chipAllow = {
  ...each(["width", "box.width", "label.width", "label.dx"], "the label differs ('1 monitor' against '1 subagent'), so the capsule's and the label's width do, and the label starts 2px earlier beside the smaller glyph"),
  ...each(["icon.width", "icon.height", "icon.dy"], "the host's capsule draws a 16px progress grid; a pill's icon is the catalog icon at its 14px small size, 1px lower in the same 32px capsule"),
  "active.background-color": "the host's capsule is a menu trigger that opens on pointerdown, so pressing it is already its expanded state (layer-01, no overlay); a popover trigger opens on click, so its pressed state is the overlay on the raised surface",
  "active.background-image": "see background-color",
  "hover.animations": "the native capsule's dithered grid runs its own spinner-radar animations",
  "focus-visible.outline": "both sides ease the outline colour over 150ms and are sampled 1/255 apart mid-transition",
}

const chipParts = { icon: "svg, [data-slot=session-activity-progress]", label: "span.truncate, [data-slot=session-activity-summary] > .truncate" }

const chip = (name, ours, extra = {}) => ({
  name,
  ours,
  native: NATIVE,
  parts: chipParts,
  // The label and the glyph differ by design (two different things are counted, and the host's dithered grid is a progress
  // indicator); the capsule's own box, surface, type, radius and states are the host's one CSS.
  allow: { ...chipAllow, ...extra },
  style: { states: ["rest", "hover", "focus", "active"] },
  motion: [{ name: "hover", from: "rest", to: "hover", props: ["background-color", "background-image", "box-shadow"], duration: 300 }],
  behaviour: [
    { name: "aria", check: "aria", attrs: ["role", "tabindex", "type", "aria-expanded"] },
    { name: "tab-stop", check: "scenario", steps: [], probe: "return [el.tagName, el.tabIndex, el.type]" },
    { name: "focus-visible", check: "focus-visible" },
    {
      name: "popup-kind",
      check: "scenario",
      only: "ours",
      steps: [],
      probe: "return el.getAttribute('aria-haspopup')",
      expect: { result: "dialog" },
    },
    { name: "popup-kind-native", na: "the host's capsule opens a menu (aria-haspopup=menu); a pill with `menu` opens the host's popover dialog (aria-haspopup=dialog). Both are the host's own triggers." },
  ],
})

export default {
  name: "lane-chip",
  viewport: "1600x1000",
  elements: [
    chip("monitor-chip", MONITOR, each(["icon.display", "icon.dx"], "the heartbeat is drawn as the capsule's ::before and ::after (two stacked mask layers, heartbeatChipCss) in a 16px box centred on the 14px, 10px-inset slot the catalog svg had, and the placeholder catalog svg is hidden, as for the clock; the capsule's box, label and padding are unchanged (108.02 x 32, label at +32.5, measured before and after)")),
    chip("schedule-chip", SCHEDULE, each(["icon.display", "icon.dx"], "the catalog has no clock: the pill names a placeholder icon, whose svg is hidden and replaced by the drawn clock as the capsule's ::before (laneChipCss), so the measured svg is not the visible glyph")),
    // Opening the host's activity panel dismisses a pill's popover and the reverse (Kobalte closes a popup on focus outside), so
    // the two never stand side by side and the runner cannot measure both at once. They were measured one after the other
    // with the same computed-style properties (DESIGN.md, "Popover rows against the host's activity panel").
    { name: "monitor-popover", ours: OUR_PANEL, native: NATIVE_PANEL, na: "the host's pill popover and its activity panel cannot be open together; compared in sequence (apps/opencode-plugins/native-ui/DESIGN.md, chip popover): panel width, min and max width, max-height, scroll owner, no open motion, z-index, surface, shadow, padding, border and radius equal" },
    { name: "monitor-row", ours: "[data-lane-chip-row]", native: `${NATIVE_PANEL} [data-component="menu-v2-item"]`, na: "as above; row height 28, padding, radius, hover, cursor, user-select, name and trailing-text type compared in sequence; the name truncates here (the host's summary does), because the trailing text is the status" },
  ],
}
