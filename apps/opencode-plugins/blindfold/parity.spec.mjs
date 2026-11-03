// Parity of the answered request row against the host's own tool row. The card's inputs and buttons are the host's
// components (`ctx.ui`), so there is no second implementation to compare; the card chrome has no native sibling.
// Needs a session whose timeline shows an answered row and an expanded "Used N Execute" group (see harness/drive2.mjs).
export default {
  name: "blindfold",
  viewport: "1400x900",
  prepare: `for (const t of document.querySelectorAll('[data-component="collapsed-tool-group"] [data-slot="collapsible-trigger"][aria-expanded="false"]')) t.click()`,
  elements: [
    {
      name: "answered-row",
      ours: "[data-blindfold-row] [data-slot=collapsible-trigger]",
      native: '[data-component="tool-part-wrapper"]:not([data-blindfold-row]) [data-slot="collapsible-trigger"]',
      parts: { title: "[data-slot=basic-tool-tool-title]" },
      style: { states: ["rest"] },
      allow: {
        "rest.opacity": "a declined or expired row is muted on purpose (0.7); an answered one is 1",
        "rest.icon": "the native Execute row carries an expand arrow; this row has nothing to expand",
        "rest.arg": "the native Execute row has no argument; this row names the fields",
        "rest.title.width": "different words",
        "rest.width": "the trigger is as wide as its words (title and field names)",
        "rest.box.width": "the trigger is as wide as its words (title and field names)",
      },
    },
    { name: "text-input", ours: "[data-blindfold-card] input", native: "input", na: "ctx.ui.TextInput is the host's own component; the app shows no second text input here to measure (the composer is contenteditable)" },
    { name: "buttons", ours: "[data-blindfold-card] button[data-component=button-v2]", native: "button", na: "ctx.ui.Button and IconButton are the host's own components" },
    { name: "card", ours: "[data-blindfold-card] [data-slot=card]", native: "[data-slot=card]", na: "the host has no inline request card to compare; the chrome reuses visual-replies' card tokens (border-muted, radius 8, bg-layer-01)" },
  ],
}
