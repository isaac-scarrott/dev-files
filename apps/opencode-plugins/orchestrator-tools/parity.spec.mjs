// Parity spec for the peer-message row against the host's own rows in the same timeline: the background-subagent row
// (`task-tool-surface`) for the row, the Questions disclosure (`collapsible-arrow`) for the arrow.
// Needs a harness session with an answered Questions row, a background subagent row and peer messages delivered through
// send_message's real path (DESIGN.md, "Peer card"). Run from the repo root:
//   OC_PW_ROOT=/private/tmp/pw OC_HARNESS_CDP_PORT=<port> node ~/.config/opencode/skills/opencode-gui-plugins/scripts/parity.mjs \
//     --spec apps/opencode-plugins/orchestrator-tools/parity.spec.mjs

const scroll = `(async () => { const v = document.querySelector("[data-slot=session-timeline-scroll] .scroll-view__viewport"); v.scrollTop = v.scrollHeight; await new Promise((r) => setTimeout(r, 400)) })()`

const HEAD = "[data-slot=injected-head]"
const PEER = "[data-injected-row][data-kind=peer]"
const ROW = `${PEER}[data-expandable=true] ${HEAD}`
const ONE = `${PEER}:not([data-expandable=true]) ${HEAD}`
const both = (reason, ...names) => Object.fromEntries(["rest", "hover"].flatMap((state) => names.map((name) => [`${state}.${name}`, reason])))


// Alignment probe, run on the host surface and on our card alike (they must return the same object): the row's box, padding,
// gap, the title and text lines, where their baselines fall, and where the content's left edge starts. `height` is left out when
// headerOnly is set (an open row grows; its header must still match).
const probe = (headerOnly) => `
  const o = el.getBoundingClientRect(), cs = getComputedStyle(el), ours = el.matches("[data-slot=injected-head]");
  const title = el.querySelector(ours ? "[data-slot=injected-title]" : "[data-component=task-tool-title]");
  const text = el.querySelector(ours ? "[data-slot=injected-preview]" : "[data-slot=basic-tool-tool-subtitle]");
  const first = text;
  const mark = (node) => { let n = node; while (n && n.nodeType !== 3) n = n.firstChild; if (!n) return null; const p = document.createElement("span"); p.style.cssText = "display:inline-block;width:0;height:0"; const r = document.createRange(); r.setStart(n, 0); r.collapse(true); r.insertNode(p); const y = p.getBoundingClientRect().top; const par = p.parentNode; p.remove(); par.normalize(); return y; };
  const t = title.getBoundingClientRect(), x = text.getBoundingClientRect();
  const ink = ours ? el.querySelector("[data-slot=injected-icon]").getBoundingClientRect() : t;
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

// Per-frame hover-in, run on the host row and ours: samples the row width, the chevron's distance from the row's right edge and the
// action's opacity every frame while the pointer enters, then checks each against the host's easing (width, margin, opacity and transform
// all 150ms `ease`, cubic-bezier(.25,.1,.25,1)), allowing the sampler's one-frame start offset.
const HOVER_START = `
  window.__hf = [];
  const s = el.closest("[data-slot=injected-head], [data-component=task-tool-surface]"), ours = s.matches("[data-slot=injected-head]");
  const chev = ours ? s.querySelector(".injected-action svg") : s.querySelector("[data-component=task-tool-action] svg");
  const slot = ours ? s.querySelector("[data-slot=injected-tail]") : s.querySelector("[data-component=task-tool-action]");
  const t0 = performance.now();
  const tick = () => { const o = s.getBoundingClientRect(), c = chev.getBoundingClientRect(); window.__hf.push({ t: performance.now() - t0, w: o.width, x: o.right - c.right, op: +getComputedStyle(slot).opacity }); if (performance.now() - t0 < 800) requestAnimationFrame(tick); };
  tick();`
const HOVER_PROBE = `
  const f = window.__hf, f0 = f[0], end = f.at(-1);
  const ease = (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, bx = 3 * (1 - m) * (1 - m) * m * 0.25 + 3 * (1 - m) * m * m * 0.25 + m * m * m; if (bx < x) lo = m; else hi = m; } const m = (lo + hi) / 2; return 3 * (1 - m) * (1 - m) * m * 0.1 + 3 * (1 - m) * m * m * 1 + m * m * m; };
  const first = f.findIndex((x, i) => i && (x.w !== f0.w || x.op !== f0.op));
  const g = end.w - f0.w, gx = end.x - f0.x, r = (n) => Math.round(n * 10) / 10;
  let best = { w: 9, o: 9, x: 9 };
  for (let shift = -16; shift <= 16; shift += 2) {
    const start = f[first - 1].t + shift; let w = 0, o = 0, x = 0;
    for (const p of f) { const u = ease((p.t - start) / 150); w = Math.max(w, Math.abs((p.w - f0.w) / g - u)); o = Math.max(o, Math.abs(p.op - u)); x = Math.max(x, Math.abs((p.x - f0.x) / gx - u)); }
    if (w + o + x < best.w + best.o + best.x) best = { w, o, x };
  }
  return { growth: r(g), chevronFromRight: r(end.x), settledOpacity: end.op, widthFollowsEase: best.w < 0.1, opacityFollowsEase: best.o < 0.1, chevronFollowsEase: best.x < 0.1 };`

export default {
  name: "orchestrator-tools-peer-row",
  viewport: "1300x1500",
  prepare: scroll,
  elements: [
    {
      name: "peer-row",
      ours: ROW,
      native: "[data-component=task-tool-surface]",
      row: "[data-slot=injected-head], [data-component=task-tool-surface]",
      parts: { icon: "[data-slot=injected-icon]", title: "[data-slot=injected-title], [data-component=task-tool-title]", text: "[data-slot=injected-preview], [data-slot=basic-tool-tool-subtitle]" },
      style: { states: ["rest", "hover"] },
      allow: {
        ...both("both rows are fit-content; the width follows each one's own words and ours fills the column when the message is long", "width", "box.width", "text.width", "title.width"),
        ...both("the card's own colour, weight and line height are never drawn: its title (530) and text (440, 20px) parts match, and the host's surface only seeds the colour of its trailing chevron", "color", "font-weight", "line-height", "outline"),
        ...both("ours leads with the direction icon (16px + 8px gap), the host's row has no leading icon", "title.dx", "text.dx"),
        ...both("ours truncates a long sender title with an ellipsis (host titles are short fixed words)", "title.overflow", "title.text-overflow"),
        ...both("the ellipsis of ours is on the first paragraph (line-clamp), so Markdown blocks below stay clipped; the host's subtitle is plain text", "text.text-overflow"),
        ...both("the host row has no leading icon; ours is measured against the host chevron beside it (16px, rgb 128 = text-faint), which passes", "icon"),
        ...both("the user asked for no pointer cursor on the peer row (the host row shows one)", "cursor"),
      },
    },
    {
      name: "alignment-one-line",
      ours: ONE,
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{ name: "alignment", check: "scenario", steps: [], probe: probe(false) }],
    },
    {
      name: "alignment-expandable-collapsed",
      ours: { selector: ROW, index: 0 },
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{ name: "alignment", check: "scenario", steps: [], probe: probe(false) }],
    },
    {
      // An open row grows, so there is no host height to compare; its header must still sit exactly where the host row's does.
      name: "alignment-expanded-header",
      ours: { selector: ROW, index: 0 },
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{
        name: "alignment",
        check: "scenario",
        only: "ours",
        steps: ["js:el.querySelector('[data-slot=injected-trigger]').click()"],
        probe: probe(true),
        expect: { result: HOST_HEADER },
        after: "document.querySelector('[data-injected-row][data-open=true] [data-slot=injected-trigger]')?.click()",
      }],
    },
    {
      // The trailing slot is the host's `task-tool-action`, copied: collapsed it takes no room, on hover it grows, fades in and slides in
      // over 150ms ease, so the fit-content row gets wider as the host row does. Measured on a row with no expand triangle (the host row
      // has none), every frame must match; the triangle's 18px extra is checked separately below.
      name: "tail-reveal",
      ours: `${ONE} [data-slot=injected-tail]`,
      native: "[data-component=task-tool-action]",
      row: "[data-slot=injected-head], [data-component=task-tool-surface]",
      style: { states: ["rest", "row"], props: ["width", "opacity", "transform", "margin", "transition", "overflow"] },
      allow: {
        "rest.box.height": "ours' slot is the 20px line (its 24px button centres on it); the host's holds a 16px icon on the same centre",
        "row.box.height": "same",
        "rest.icon.width": "the first svg in ours' slot is the 14px expand triangle, not the chevron (compared in open-session-icon)",
        "row.icon.width": "same",
        "rest.icon.height": "same",
        "row.icon.height": "same",
        "curve.width": "the same one-frame sampling phase between the two runs reads as up to 0.2px of the slot width at 0ms (it passed in some runs and not others with identical code); the per-frame easing fit in tail-hover-in-per-frame checks the width against the host curve with the phase removed",
        "curve.transform": "the slide is 4px, so a one-frame sampling phase difference between the two runs reads as up to 0.5px; the per-frame easing fit in tail-hover-in-per-frame covers the same motion with the phase removed",
        "rest.overflow": "ours clips with overflow-clip-margin so the button's 4px side padding stays visible; the host's slot holds a bare 16px icon",
        "row.overflow": "same",
        "rest.margin": "ours cancels the row's 8px flex gap with a negative margin (the host's surface has no gap): the net space is 0 at rest and 2px when open on both",
        "row.margin": "same",
      },
      motion: [{ name: "tail-reveal", from: "rest", to: "row", props: ["opacity", "transform", "width"], duration: 400, tolerance: 0.12 }],
      behaviour: [
        { name: "tail-hover-in-per-frame", check: "scenario", steps: [`js:${HOVER_START}`, "hover", "wait:800"], probe: HOVER_PROBE },
      ],
    },
    {
      // With the expand triangle in front the slot is 18px wider than a bare chevron (16 triangle + 2 gap): the same motion, a larger distance.
      name: "tail-reveal-with-triangle",
      ours: { selector: ROW, index: 0 },
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{
        name: "tail-hover-in-per-frame",
        check: "scenario",
        only: "ours",
        steps: [`js:${HOVER_START}`, "hover", "wait:800"],
        probe: HOVER_PROBE,
        expect: { result: { growth: 36, chevronFromRight: 12, settledOpacity: 1, widthFollowsEase: true, opacityFollowsEase: true, chevronFollowsEase: true } },
      }],
    },
    {
      // The go-to-session affordance: the host's row shows a bare 16px chevron-right (`task-tool-action`, rgb 128 = text-faint)
      // that fades in on hover. Ours is the same catalog icon inside a 24px ghost button, centred on the same x from the row's
      // right edge (20px) and the same y; the button's box is the only difference, so the compared element is the icon.
      name: "open-session-icon",
      ours: `${ROW} .injected-action svg`,
      native: "[data-component=task-tool-action] svg",
      row: "[data-slot=injected-head], [data-component=task-tool-surface]",
      style: { states: ["row", "hover"], props: ["width", "height", "color", "opacity"] },
      allow: {
        ...Object.fromEntries(["row", "hover"].flatMap((state) => [[`${state}.row.inset-end`, "ours sits in a 24px button after the triangle; the icon's centre is 20px from the row's right edge on both sides (checked in alignment-open-icon)"], [`${state}.row.centre-dy`, "checked in alignment-open-icon"]])),
      },
    },
    {
      // Where the chevron ends up once the row is hovered: the same catalog icon at the same size, distance from the right edge and height.
      name: "open-session-icon-position",
      ours: ONE,
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{
        name: "icon-source-and-centre",
        check: "scenario",
        steps: ["hover", "wait:400"],
        probe: `const ours = el.matches("[data-slot=injected-head]"), v = el.querySelector(ours ? ".injected-action svg" : "[data-component=task-tool-action] svg"), o = el.getBoundingClientRect(), r = v.getBoundingClientRect(); return { href: v.querySelector("use").getAttribute("href"), size: [r.width, r.height], fromRight: Math.round((o.right - (r.left + r.width / 2)) * 10) / 10, cy: Math.round((r.top + r.height / 2 - o.top) * 10) / 10, color: getComputedStyle(v).color }`,
      }],
    },
    {
      name: "open-session-button",
      ours: `${ROW} .injected-action`,
      native: "[data-slot=basic-tool-action] button",
      na: "the host's ghost action button (24px, radius 6px, hover-revealed) only exists inside an opened Execute tool part, which the seeded session does not have; ours is measured in alignment (24px, radius 6px) and its icon against the host's go-to-session chevron above",
    },
  ],
}
