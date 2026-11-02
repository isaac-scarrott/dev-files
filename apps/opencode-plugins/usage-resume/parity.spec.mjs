// Parity: usage-resume's Settings row next to a native switch row. The composer pill is a host `ComposerPill`, so there is
// nothing of ours to compare. Run against a harness window with the plugin loaded, Settings > Preferences open, scrolled to the rows.
//   OC_PW_ROOT=/private/tmp/ur2-pw OC_HARNESS_CDP_PORT=9361 node .claude/skills/opencode-gui-plugins/scripts/parity.mjs \
//     --spec apps/opencode-plugins/usage-resume/parity.spec.mjs [--only settings-row]

export default {
  name: "usage-resume",
  viewport: "1500x900",
  elements: [
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
