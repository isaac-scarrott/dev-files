// Row time vs its nearest native siblings: the row's 11px/14px muted second line (typography) and the status mark slot (position, hover).
export default {
  name: "sidebar-row-time",
  viewport: "1600x1000",
  elements: [
    {
      name: "time-text-vs-repo-line",
      ours: "[data-sidebar-time]",
      native: "[data-sidebar-repo]",
      row: "[data-titlebar-tab]",
      style: { states: ["rest"], props: ["font-size", "font-weight", "line-height", "color", "font-family", "font-style", "letter-spacing", "text-transform", "transition", "cursor"], partProps: [] },
      allow: {
        "rest.cursor": "pointer-events none: the hit target is the link under it, whose cursor shows; the repo line sits inside that link",
        "rest.box.width": "a line of text, not a one-line badge that fills the row",
        "rest.box.height": "the time's box is the 20px status slot height so it centres like the mark; its text line is 14px (line-height row)",
        "rest.row.centre-dy": "the repo line is the row's top line; the time is centred like the status mark (centre-dy 0 against the slot, see the next element)",
      },
    },
    {
      name: "time-slot-vs-status-slot",
      ours: "[data-sidebar-time]",
      native: "[data-slot=tab-status]",
      row: "[data-titlebar-tab]",
      style: { states: ["rest", "row", "hover"], props: ["height", "opacity", "visibility", "transition", "pointer-events", "z-index"], partProps: [] },
      allow: {
        "rest.box.width": "the text is as wide as its content (24px for 2 digits + unit); the mark is a fixed 20px square",
        "rest.row.inset-end": "text aligns to the row's 6px end padding like the title and repo line; the mark's 14px ring is centred in its 20px slot at 4px",
        "rest.icon": "text, not an icon",
        "row.box.width": "the text is as wide as its content (24px for 2 digits + unit); the mark is a fixed 20px square",
        "row.row.inset-end": "text aligns to the row's 6px end padding like the title and repo line; the mark's 14px ring is centred in its 20px slot at 4px",
        "row.icon": "text, not an icon",
        "hover.box.width": "the text is as wide as its content (24px for 2 digits + unit); the mark is a fixed 20px square",
        "hover.row.inset-end": "text aligns to the row's 6px end padding like the title and repo line; the mark's 14px ring is centred in its 20px slot at 4px",
        "hover.icon": "text, not an icon",
      },
    },
  ],
}
