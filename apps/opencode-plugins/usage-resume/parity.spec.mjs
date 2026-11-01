// Parity: usage-resume's composer toggle next to the composer's own attach button (icon-button-v2, large, ghost-muted),
// and its Settings row next to a native switch row. Run each against a harness window with the plugin loaded:
//   composer: a seeded session open.   settings: Settings > Preferences open, scrolled to the rows.
//   OC_PW_ROOT=/private/tmp/ur2-pw OC_HARNESS_CDP_PORT=9361 node .claude/skills/opencode-gui-plugins/scripts/parity.mjs \
//     --spec apps/opencode-plugins/usage-resume/parity.spec.mjs [--only composer-toggle | settings-row]

const OURS = "[data-usage-resume-toggle] button"
const NATIVE = '[data-action="composer-attach"]'

export default {
  name: "usage-resume",
  viewport: "1500x900",
  elements: [
    {
      name: "composer-toggle",
      ours: OURS,
      native: NATIVE,
      row: "form[data-component=composer]",
      allow: {
        "row.inset-end": "the toggle sits after the model picker, the attach button before it: their distance from the row's end differs by design",
        "row.inset-start": "the toggle sits after the model picker, the attach button before it: their distance from the row's start differs by design",
        "active.background-color":
          "the attach button is a dropdown trigger and opens its menu on pointerdown, so it shows the expanded look (0.08); a plain host IconButton (Search sessions) measures 0.04 when pressed, as ours does",
      },
      style: { states: ["rest", "row", "hover", "focus", "active"] },
      motion: [{ name: "hover", from: "rest", to: "hover", props: ["background-color", "color"], duration: 300 }],
      behaviour: [
        { name: "events", check: "event-contract", events: ["pointerdown", "mousedown", "dblclick", "dragstart", "contextmenu"] },
        {
          name: "aria",
          check: "aria",
          attrs: ["data-component", "data-size", "data-variant", "type"],
        },
        { name: "focus-visible", check: "focus-visible" },
        { name: "tooltip", check: "tooltip" },
      ],
    },
    {
      name: "composer-toggle-pressed",
      na: "no native composer button has a pressed (on) state: the pressed look is the host IconButton's own `pressed` prop, checked by eye and by aria-pressed in the harness run",
      ours: OURS,
      native: NATIVE,
    },
    {
      name: "settings-row",
      ours: '[data-action="usage-resume-default"]',
      native: '[data-action="settings-mobile-diff-wrap"]',
      row: "[data-component=settings-row]",
      persistent: true,
      parts: {
        row: "[data-component=settings-row]",
      persistent: true,
        title: "[data-slot=settings-row-title]",
        description: "[data-slot=settings-row-description]",
        control: "[data-slot=settings-row-control]",
        switch: "[data-slot=switch-control]",
      },
      allow: {
        "row.inset-end": "rows differ in copy length only",
        "part.description.height": "the description wraps differently: different copy",
        "part.row.height": "the description wraps differently: different copy",
      },
      style: { states: ["rest", "hover"] },
      behaviour: [{ name: "aria", check: "aria", attrs: ["role", "data-component", "data-appearance"] }],
    },
  ],
}
