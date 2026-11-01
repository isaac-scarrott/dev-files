// Parity spec for the peer-message row against the host's own rows in the same timeline: the background-subagent row
// (`task-tool-surface`) for the row, the Questions disclosure (`collapsible-arrow`) for the arrow.
// Needs a harness session with an answered Questions row, a background subagent row and peer messages delivered through
// send_message's real path (DESIGN.md, "Peer card"). Run from the repo root:
//   OC_PW_ROOT=/private/tmp/pw OC_HARNESS_CDP_PORT=<port> node ~/.config/opencode/skills/opencode-gui-plugins/scripts/parity.mjs \
//     --spec apps/opencode-plugins/orchestrator-tools/parity.spec.mjs

const scroll = `(async () => { const v = document.querySelector("[data-slot=session-timeline-scroll] .scroll-view__viewport"); v.scrollTop = v.scrollHeight; await new Promise((r) => setTimeout(r, 400)) })()`

const ROW = "[data-peer-card][data-expandable=true]"
const both = (reason, ...names) => Object.fromEntries(["rest", "hover"].flatMap((state) => names.map((name) => [`${state}.${name}`, reason])))


// Alignment probe, run on the host surface and on our card alike (they must return the same object): the row's box, padding,
// gap, the title and text lines, where their baselines fall, and where the content's left edge starts. `height` is left out when
// headerOnly is set (an open row grows; its header must still match).
const probe = (headerOnly) => `
  const o = el.getBoundingClientRect(), cs = getComputedStyle(el), ours = el.hasAttribute("data-peer-card");
  const title = el.querySelector(ours ? "[data-slot=peer-name]" : "[data-component=task-tool-title]");
  const text = el.querySelector(ours ? "[data-slot=peer-text]" : "[data-slot=basic-tool-tool-subtitle]");
  const first = ours ? (el.querySelector("[data-slot=peer-text] [data-markdown-block] > *") || text) : text;
  const mark = (node) => { let n = node; while (n && n.nodeType !== 3) n = n.firstChild; if (!n) return null; const p = document.createElement("span"); p.style.cssText = "display:inline-block;width:0;height:0"; const r = document.createRange(); r.setStart(n, 0); r.collapse(true); r.insertNode(p); const y = p.getBoundingClientRect().top; const par = p.parentNode; p.remove(); par.normalize(); return y; };
  const t = title.getBoundingClientRect(), x = text.getBoundingClientRect();
  const ink = ours ? el.querySelector("[data-slot=peer-dir] path").getBoundingClientRect() : t;
  const cy = o.top + ${headerOnly ? 18 : "o.height / 2"}, xc = ${headerOnly ? "x.top + 10" : "x.top + x.height / 2"}, r2 = (n) => Math.round(n * 100) / 100;
  const tf = getComputedStyle(title), xf = getComputedStyle(first);
  return {
    ${headerOnly ? "" : "height: r2(o.height),"}
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(" "),
    radius: cs.borderRadius,
    contentLeft: r2(ink.left - o.left),
    gapTitleText: r2(x.left - t.right),
    titleCentreDy: r2(t.top + t.height / 2 - cy),
    textCentreDy: r2(xc - cy),
    iconCentreDy: r2(ink.top + ink.height / 2 - cy),
    baselineDelta: r2(mark(first) - mark(title)),
    title: [tf.fontSize, tf.fontWeight, tf.lineHeight, tf.letterSpacing].join("/"),
    text: [xf.fontSize, xf.fontWeight, xf.lineHeight, xf.letterSpacing].join("/"),
  };`

// What the host's subagent row measures (2.2.5, harness): 8px 12px padding, 8px radius, title 13px/530, subtitle 13px/440 on 20px lines
// that share a baseline and the row's centre, 8px between them, content starting at the 12px padding edge.
const HOST_HEADER = { padding: "8px 12px 8px 12px", radius: "8px", contentLeft: 12, gapTitleText: 8, titleCentreDy: 0, textCentreDy: 0, iconCentreDy: 0, baselineDelta: 0, title: "13px/530/20px/-0.04px", text: "13px/440/20px/-0.04px" }

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
      name: "alignment-one-line",
      ours: "[data-peer-card]",
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{ name: "alignment", check: "scenario", steps: [], probe: probe(false) }],
    },
    {
      name: "alignment-expandable-collapsed",
      ours: { selector: "[data-peer-card][data-expandable=true]", index: 0 },
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{ name: "alignment", check: "scenario", steps: [], probe: probe(false) }],
    },
    {
      // An open row grows, so there is no host height to compare; its header must still sit exactly where the host row's does.
      name: "alignment-expanded-header",
      ours: { selector: "[data-peer-card][data-expandable=true]", index: 0 },
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{
        name: "alignment",
        check: "scenario",
        only: "ours",
        steps: ["js:el.querySelector('[data-slot=peer-trigger]').click()"],
        probe: probe(true),
        expect: { result: HOST_HEADER },
        after: "document.querySelector('[data-peer-card][data-open=true] [data-slot=peer-trigger]')?.click()",
      }],
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
      // The go-to-session affordance: the host's row shows a bare 16px chevron-right (`task-tool-action`, rgb 128 = text-faint)
      // that fades in on hover. Ours is the same catalog icon inside a 24px ghost button, centred on the same x from the row's
      // right edge (20px) and the same y; the button's box is the only difference, so the compared element is the icon.
      name: "open-session-icon",
      ours: `${ROW} .peer-open svg`,
      native: "[data-component=task-tool-action] svg",
      row: "[data-peer-card], [data-component=task-tool-surface]",
      style: { states: ["row", "hover"], props: ["width", "height", "color", "opacity"] },
      allow: {
        ...Object.fromEntries(["row", "hover"].flatMap((state) => [[`${state}.row.inset-end`, "ours sits in a 24px button after the triangle; the icon's centre is 20px from the row's right edge on both sides (checked in alignment-open-icon)"], [`${state}.row.centre-dy`, "checked in alignment-open-icon"]])),
      },
      behaviour: [{
        name: "icon-source-and-centre",
        check: "scenario",
        steps: ["hover", "wait:400"],
        probe: `const s = el.closest("[data-peer-card], [data-component=task-tool-surface]"), o = s.getBoundingClientRect(), r = el.getBoundingClientRect(); return { href: el.querySelector("use").getAttribute("href"), size: [r.width, r.height], fromRight: Math.round((o.right - (r.left + r.width / 2)) * 10) / 10, cy: Math.round((r.top + r.height / 2 - o.top) * 10) / 10, color: getComputedStyle(el).color }`,
      }],
    },
    {
      name: "open-session-button",
      ours: `${ROW} .peer-open`,
      native: "[data-slot=basic-tool-action] button",
      na: "the host's ghost action button (24px, radius 6px, hover-revealed) only exists inside an opened Execute tool part, which the seeded session does not have; ours is measured in alignment (24px, radius 6px) and its icon against the host's go-to-session chevron above",
    },
  ],
}
