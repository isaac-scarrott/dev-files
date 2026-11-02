// Parity spec for the peer-message row against the host's own rows in the same timeline: the background-subagent row
// (`task-tool-surface`) for the row, the Questions disclosure (`collapsible-arrow`) for the arrow.
// The spacing-* elements also need plain user bubbles followed by assistant turns, injected rows ending a run and consecutive ones.
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


// Vertical rhythm of an injected row against the host's plain user bubble, probed identically on both sides over every user row of
// the timeline (the host's own: its row, hidden footer actions and TurnGap spacers included). Reported, as distinct rounded values:
//   footer-to-row  the previous assistant row's bottom (its hover-only footer included) to this user row's top
//   row-height     the user row's height, by what follows it: `end` (an assistant part) or `run` (a TurnGap and another user message)
//   gap-below      the bubble or header's bottom to the next assistant part's top, by part kind (the part's own margin is in it)
//   total          this user row's top to the next assistant part's top, by part kind (what the eye sees from row to text)
//   run            this user row's top to the next user message's top (row height + the 4px TurnGap)
// The timeline is virtualised, so a pair whose neighbours are not both mounted (a gap outside 0-120px) is skipped.
const spacing = (which) => `
  const ours = el.matches("[data-slot=injected-head]");
  const rows = [...document.querySelectorAll("[data-timeline-row=UserMessage]")].filter((row) => ours ? row.querySelector("[data-injected-row]") : !row.hasAttribute("data-injected-host"));
  const real = (n) => (getComputedStyle(n).display === "contents" ? [...n.children].flatMap(real) : [n]);
  const info = (key) => { const row = key?.querySelector("[data-timeline-row]"); if (!row) return null; const kind = row.dataset.timelineRow; const c = row.querySelector("[data-slot=session-turn-assistant-content]"); const part = c?.firstElementChild ? real(c.firstElementChild)[0] : null; return { kind, row, part, comp: part?.dataset.component ?? "" }; };
  const out = { "footer-to-row": new Set(), "row-height": new Set(), "gap-below": new Set(), total: new Set(), run: new Set() };
  const add = (name, gap, label = "") => { if (gap >= 0 && gap <= 120) out[name].add(label + Math.round(gap)); };
  for (const row of rows) {
    const key = row.closest("[data-timeline-key]"), box = row.querySelector(ours ? "[data-slot=injected-head]" : "[data-slot=user-message-body]"), r = row.getBoundingClientRect();
    if (!box) continue;
    const b = box.getBoundingClientRect();
    let p = key.previousElementSibling; if (info(p)?.kind === "TurnGap") p = p.previousElementSibling;
    const before = info(p); if (before?.kind === "AssistantPart") add("footer-to-row", r.top - before.row.getBoundingClientRect().bottom + (info(key.previousElementSibling)?.kind === "TurnGap" ? 0 : 0));
    const n = key.nextElementSibling, after = info(n);
    if (after?.kind === "AssistantPart" && after.part) { const t = after.part.getBoundingClientRect().top; add("gap-below", t - b.bottom, after.comp + "="); add("total", t - r.top, after.comp + "="); add("row-height", r.height, "end="); }
    else if (after?.kind === "TurnGap") { const m = info(n.nextElementSibling); if (m?.kind === "UserMessage") { add("run", m.row.getBoundingClientRect().top - r.top); add("row-height", r.height, "run="); } }
  }
  const pick = ${JSON.stringify(which)};
  return pick.map((k) => k + ":" + [...out[k]].sort().join(",")).join(" ");`

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

// Rows picked by width on both sides, so the hover checks compare like with like whatever order the session lists them in: the widest
// (a row at its cap, text longer than the column) and the narrowest (it grows on hover). Ours has an expandable and a plain kind.
// The seeded session needs host subagent rows and peer messages of both lengths, one short peer message with a second line (an
// expandable row that still fits).
const TAG_ROWS = `(() => {
  document.querySelectorAll("[data-parity-long], [data-parity-short], [data-parity-short-expandable]").forEach((e) => { for (const a of ["data-parity-long", "data-parity-short", "data-parity-short-expandable"]) e.removeAttribute(a); });
  const pick = (list, widest) => list.reduce((a, b) => (!a || (widest ? b.getBoundingClientRect().width > a.getBoundingClientRect().width : b.getBoundingClientRect().width < a.getBoundingClientRect().width) ? b : a), null);
  const peers = [...document.querySelectorAll("${PEER}[data-expandable=true] ${HEAD}")];
  const hosts = [...document.querySelectorAll("[data-component=task-tool-surface]")];
  pick(peers, true)?.setAttribute("data-parity-long", "");
  pick(hosts, true)?.setAttribute("data-parity-long", "");
  pick(hosts, false)?.setAttribute("data-parity-short", "");
  pick(peers, false)?.setAttribute("data-parity-short-expandable", "");
})()`
const scrollAndTag = `(async () => { await ${scroll}; ${TAG_ROWS} })()`

// Per-frame hover-in on a full-width row. The host's row does not grow: its title+preview clip box (overflow hidden, text cut mid-glyph,
// no ellipsis) gives up the slot's width, and the chevron stays on the row's right edge, moving 4px. Samples, every frame: the row's
// width, the chevron's distance from the row's right edge, the clip box's right edge from the row's right edge and the slot's opacity.
const LONG_START = `
  window.__hf = [];
  const s = el, ours = s.matches("[data-slot=injected-head]");
  const chev = ours ? s.querySelector(".injected-action svg") : s.querySelector("[data-component=task-tool-action] svg");
  const slot = ours ? s.querySelector("[data-slot=injected-tail]") : s.querySelector("[data-component=task-tool-action]");
  const text = ours ? s.querySelector("[data-slot=injected-preview]") : s.querySelector("[data-slot=basic-tool-tool-subtitle]");
  let clip = text.parentElement; while (clip !== s && getComputedStyle(clip).overflowX !== "hidden") clip = clip.parentElement;
  window.__clip = clip;
  const t0 = performance.now();
  const tick = () => { const o = s.getBoundingClientRect(), c = chev.getBoundingClientRect(), k = clip.getBoundingClientRect(); window.__hf.push({ t: performance.now() - t0, w: o.width, x: o.right - c.right, k: o.right - k.right, op: +getComputedStyle(slot).opacity }); if (performance.now() - t0 < 800) requestAnimationFrame(tick); };
  tick();`
const LONG_PROBE = `
  const f = window.__hf, f0 = f[0], end = f.at(-1), ours = el.matches("[data-slot=injected-head]");
  const ease = (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, bx = 3 * (1 - m) * (1 - m) * m * 0.25 + 3 * (1 - m) * m * m * 0.25 + m * m * m; if (bx < x) lo = m; else hi = m; } const m = (lo + hi) / 2; return 3 * (1 - m) * (1 - m) * m * 0.1 + 3 * (1 - m) * m * m * 1 + m * m * m; };
  const first = f.findIndex((x, i) => i && (x.k !== f0.k || x.op !== f0.op));
  const gx = end.x - f0.x, gk = end.k - f0.k, r = (n) => Math.round(n * 10) / 10;
  let best = { x: 9, k: 9, o: 9 };
  for (let shift = -16; shift <= 16; shift += 2) {
    const start = f[first - 1].t + shift; let x = 0, k = 0, o = 0;
    for (const p of f) { const u = ease((p.t - start) / 150); x = Math.max(x, Math.abs((p.x - f0.x) / gx - u)); k = Math.max(k, Math.abs((p.k - f0.k) / gk - u)); o = Math.max(o, Math.abs(p.op - u)); }
    if (x + k + o < best.x + best.k + best.o) best = { x, k, o };
  }
  const text = ours ? el.querySelector("[data-slot=injected-preview]") : el.querySelector("[data-component=basic-tool-tool-subtitle], [data-slot=basic-tool-tool-subtitle]");
  const clip = window.__clip, cs = getComputedStyle(clip), parent = el.closest("[data-timeline-row]").getBoundingClientRect();
  // our triangle is the one addition: it makes the slot, and so the clip box's give, 18px larger
  const triangle = ours && el.closest("[data-injected-row]").dataset.expandable === "true" && el.closest("[data-injected-row]").hasAttribute("data-action") ? 18 : 0;
  return {
    rowGrowth: r(end.w - f0.w),
    capGap: r(parent.width - el.getBoundingClientRect().width),
    chevronFromRight: r(end.x), chevronTravel: r(gx),
    gapBeforeSlotAtRest: r(f0.k),
    clipGivesUp: r(gk - triangle),
    clipBox: cs.overflowX + "/" + cs.textOverflow,
    textCutByClipBox: text.scrollWidth <= text.clientWidth + 1 && window.__clip.scrollWidth > window.__clip.clientWidth,
    settledOpacity: end.op,
    chevronFollowsEase: best.x < 0.1, clipFollowsEase: best.k < 0.1, opacityFollowsEase: best.o < 0.1,
  };`

export default {
  name: "orchestrator-tools-peer-row",
  viewport: "1300x1500",
  prepare: scrollAndTag,
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
      // An injected message stands in a user turn, so its vertical rhythm is the host user bubble's: the same gap from the assistant part above,
      // the same row height (the bubble's 37px plus the 8px margin and 20px actions footer the host reserves under the last message of a run = 65px),
      // so the same distance from the row top to the next assistant part's top, and in a run the 4px TurnGap between rows with no footer (37px).
      // Probed on every user row in the timeline, the sides must list the same distinct values.
      name: "spacing-user-turn",
      ours: HEAD,
      native: "[data-slot=user-message-body]",
      style: false,
      behaviour: [
        { name: "footer-to-row-and-row-height", check: "scenario", steps: [], probe: spacing(["footer-to-row", "row-height"]) },
        { name: "row-top-to-next-text", check: "scenario", steps: [], probe: spacing(["total"]) },
        // The pill is the 36px subagent-row header against the bubble's 37px, so the visible gap under it is 1px more (the row totals above are equal).
        { name: "gap-below-header", check: "scenario", only: "ours", steps: [], probe: spacing(["gap-below"]), expect: { result: "gap-below:text-part=53,tool-part-wrapper=29" } },
        { name: "gap-in-a-run", check: "scenario", steps: [], probe: spacing(["run"]) },
      ],
    },
    {
      // The row's left edge is the message column's: the same x as the host subagent row, which sits at the column edge in an assistant turn.
      name: "spacing-left-edge",
      ours: HEAD,
      native: "[data-component=task-tool-surface]",
      style: false,
      behaviour: [{ name: "left-edge", check: "scenario", steps: [], probe: "return Math.round(el.getBoundingClientRect().left)" }],
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
      native: "[data-component=task-tool-surface][data-parity-short] [data-component=task-tool-action]",
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
      },
      motion: [{ name: "tail-reveal", from: "rest", to: "row", props: ["opacity", "transform", "width"], duration: 400, tolerance: 0.12 }],
      behaviour: [
        { name: "tail-hover-in-per-frame", check: "scenario", steps: [`js:${HOVER_START}`, "hover", "wait:800"], probe: HOVER_PROBE },
      ],
    },
    {
      // With the expand triangle in front the slot is 18px wider than a bare chevron (16 triangle + 2 gap): the same motion, a larger distance.
      name: "tail-reveal-with-triangle",
      ours: `${HEAD}[data-parity-short-expandable]`,
      native: "[data-component=task-tool-surface][data-parity-short]",
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
      // A row at its cap. The host's `max-width: calc(100% - 24px)` row does not grow on hover: its clip box shrinks by the slot (16 + 2px) and cuts
      // the text mid-glyph, with the chevron riding the row's right edge for 4px. Ours has the same cap, clip box and slot at the row's end; the
      // expand triangle (ours only) makes the slot, and the clip box's give, 18px more, which the probe takes out.
      name: "long-row-hover",
      ours: `${HEAD}[data-parity-long]`,
      native: "[data-component=task-tool-surface][data-parity-long]",
      style: false,
      behaviour: [{
        name: "long-row-hover-in-per-frame",
        check: "scenario",
        steps: [`js:${LONG_START}`, "hover", "wait:800"],
        probe: LONG_PROBE,
      }],
    },
    {
      // Every part of the header toggles on a real mouse click (CDP mousePressed/mouseReleased at the part's centre), at rest and with the
      // trailing slot open, on a full-width row and a short one. The triangle once did not: the tail slot sat above the trigger button
      // with the default pointer-events and took its clicks (regression after the head was restructured, 2026-11-02). The probe also
      // reports what is topmost at the point, so a future overlay shows by name.
      name: "click-targets",
      ours: `${HEAD}[data-parity-long]`,
      native: "[data-component=task-tool-surface][data-parity-long]",
      style: false,
      behaviour: ["[data-slot=injected-icon]", "[data-slot=injected-title]", "[data-slot=injected-arrow]"].flatMap((part) =>
        [false, true].map((hovered) => ({
          name: `click-${part.slice(11, -1)}${hovered ? "-hovered" : "-rest"}`,
          check: "scenario",
          only: "ours",
          steps: [
            ...(hovered ? [{ do: "hover", target: part }, "wait:400"] : []),
            { do: "click", target: part },
            "wait:500",
          ],
          probe: `const row = el.closest("[data-injected-row]"); return { open: row.dataset.open }`,
          expect: { result: { open: "true" } },
          after: "document.querySelectorAll('[data-injected-row][data-open=true] [data-slot=injected-trigger]').forEach((trigger) => trigger.click())",
        }))),
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
