/* ArchMap runtime — draws the whole map chrome from a data model.
   The agent supplies data + a shape per level; this draws cards, connectors,
   drill-down, breadcrumb, browser history, and the ask chat. See RUNTIME.md.

   ArchMap.render({
     repo, summary,
     shape: "flow"|"lanes"|"layers"|"radial"|"sequence"|"free",  // root layout
     laneOrder: ["sync","stores","async"],   // optional, for lanes/layers
     nodes: [ PART, ... ],
     edges: [ {from, to, label, primary?, return?}, ... ],
   })
   PART = { id, label, kind, resp, tech:[], file|files:[], detail,
            lane, layer, x, y, primary, demote, hub,
            shape, laneOrder, children:[PART], edges:[EDGE] }
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const CARD_W = 294, GAP_X = 56, ROW_H = 176, BAND_GAP = 30;
  let MODEL = null, path = [];
  let crumbsEl, titleEl, ledeEl, metaEl, focusEl, hintEl, stageEl, stageWrapEl;

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const filesOf = (n) => n.files || (n.file ? [n.file] : []);
  const navigable = (n) => n && !n.demote && ((n.children || []).length || filesOf(n).length || n.detail);

  function nodeAt(p) { let list = MODEL.nodes, n = null; for (const id of p) { n = (list || []).find((c) => c.id === id); if (!n) break; list = n.children || []; } return n; }
  function frameAt(p) {
    if (!p.length) return { nodes: MODEL.nodes || [], edges: MODEL.edges || [], shape: MODEL.shape || "flow", laneOrder: MODEL.laneOrder, focus: null };
    const n = nodeAt(p);
    return { nodes: n.children || [], edges: n.edges || [], shape: n.shape || "flow", laneOrder: n.laneOrder, focus: n };
  }

  /* ---- layout: returns { pos:{id:{left,top}}, height, bands } ---- */
  function layout(shape, nodes, lo, W) {
    const pos = {}, bands = [];
    const perRow = Math.max(1, Math.floor((W + GAP_X) / (CARD_W + GAP_X)));
    if (shape === "free") {
      let mb = 0;
      nodes.forEach((n) => { const left = (n.x ?? 50) / 100 * (W - CARD_W); const top = (n.y ?? 50) / 100 * 520; pos[n.id] = { left, top }; mb = Math.max(mb, top + 150); });
      return { pos, height: mb + 20, bands };
    }
    if (shape === "lanes" || shape === "layers") {
      const key = shape === "layers" ? "layer" : "lane";
      const order = lo ? lo.slice() : [];
      const groups = {};
      nodes.forEach((n) => { const l = n[key] || "—"; if (!order.includes(l)) order.push(l); (groups[l] = groups[l] || []).push(n); });
      let y = 34;
      order.forEach((l) => {
        const g = groups[l] || [];
        bands.push({ label: l, top: y, full: shape === "layers" });
        g.forEach((n, i) => { const r = Math.floor(i / perRow), c = i % perRow; pos[n.id] = { left: c * (CARD_W + GAP_X), top: y + r * ROW_H }; });
        y += Math.max(1, Math.ceil(g.length / perRow)) * ROW_H + BAND_GAP;
      });
      return { pos, height: y, bands };
    }
    if (shape === "radial") {
      const hub = nodes.find((n) => n.hub) || nodes[0];
      const others = nodes.filter((n) => n !== hub);
      const cx = (W - CARD_W) / 2, cyc = 250, rx = Math.min(cx - 20, 360), ry = 210;
      if (hub) pos[hub.id] = { left: cx, top: cyc };
      others.forEach((n, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / others.length; pos[n.id] = { left: cx + Math.cos(a) * rx, top: cyc + Math.sin(a) * ry }; });
      return { pos, height: cyc + ry + 170, bands };
    }
    nodes.forEach((n, i) => { const r = Math.floor(i / perRow), c = i % perRow; pos[n.id] = { left: c * (CARD_W + GAP_X), top: r * ROW_H }; });
    return { pos, height: Math.ceil(nodes.length / perRow) * ROW_H, bands };
  }

  function card(n) {
    const cls = "am-card" + (n.primary ? " am-primary" : "") + (n.demote ? " am-demote" : "");
    const c = el("button", cls);
    const kids = (n.children || []).length;
    const footer = kids ? `<div class="am-more">${kids} inside ›</div>` : "";
    const tech = (n.tech || []).map((t) => `<span class="am-chip">${esc(t)}</span>`).join("");
    c.innerHTML =
      `<div class="am-kind">${esc(n.kind || (kids ? "subsystem" : "module"))}</div>` +
      `<div class="am-name">${esc(n.label)}</div>` +
      (n.resp ? `<div class="am-resp">${esc(n.resp)}</div>` : "") +
      (tech ? `<div class="am-chips">${tech}</div>` : "") + footer;
    if (navigable(n)) c.onclick = () => go(n.id); else c.style.cursor = "default";
    return c;
  }

  /* ---- edges: measure rects, draw straight clipped arrows + labels ---- */
  function edgeMarkers() {
    return `<defs>
      <marker id="am-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>
      <marker id="am-ar-p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4338ca"/></marker></defs>`;
  }
  // straight connector (radial / free): clipped to card borders, label chip at midpoint
  function drawEdges(stage, edges, idEl) {
    if (!edges || !edges.length) return;
    const sr = stage.getBoundingClientRect();
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "am-edges"); svg.innerHTML = edgeMarkers();
    const rel = (e) => { const r = e.getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }; };
    const border = (b, tx, ty) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy; if (!dx && !dy) return { x: cx, y: cy }; const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : 1e9, dy ? b.h / 2 / Math.abs(dy) : 1e9); return { x: cx + dx * s, y: cy + dy * s }; };
    edges.forEach((e) => {
      const a = idEl[e.from], z = idEl[e.to]; if (!a || !z) return;
      const ra = rel(a), rz = rel(z), ac = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 }, zc = { x: rz.x + rz.w / 2, y: rz.y + rz.h / 2 };
      const p1 = border(ra, zc.x, zc.y), p2 = border(rz, ac.x, ac.y);
      const ln = document.createElementNS(NS, "line"); ln.setAttribute("class", "am-edge" + (e.primary ? " am-edge-primary" : ""));
      ln.setAttribute("x1", p1.x); ln.setAttribute("y1", p1.y); ln.setAttribute("x2", p2.x); ln.setAttribute("y2", p2.y);
      if (e.return) ln.setAttribute("stroke-dasharray", "5 4");
      ln.setAttribute("marker-end", `url(#am-ar${e.primary ? "-p" : ""})`); svg.appendChild(ln);
      if (e.label) { const d = el("div", "am-elabel-d"); d.textContent = e.label; d.style.left = ((p1.x + p2.x) / 2) + "px"; d.style.top = ((p1.y + p2.y) / 2) + "px"; stage.appendChild(d); }
    });
    stage.appendChild(svg);
  }
  // dagre auto-layout (flow / lanes / layers / default): optimised placement + routed edges
  function smooth(pts) {
    if (pts.length < 3) return `M${pts[0].x},${pts[0].y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) { const c = pts[i], nx = (pts[i].x + pts[i + 1].x) / 2, ny = (pts[i].y + pts[i + 1].y) / 2; d += ` Q${c.x},${c.y} ${nx},${ny}`; }
    const L = pts[pts.length - 1]; return d + ` L${L.x},${L.y}`;
  }
  function dagreEdges(stage, g, edges) {
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "am-edges"); svg.innerHTML = edgeMarkers();
    (edges || []).forEach((e, i) => {
      const ge = g.edge(e.from, e.to, "e" + i); if (!ge || !ge.points || !ge.points.length) return;
      const pth = document.createElementNS(NS, "path"); pth.setAttribute("class", "am-edge" + (e.primary ? " am-edge-primary" : ""));
      pth.setAttribute("d", smooth(ge.points));
      if (e.return) pth.setAttribute("stroke-dasharray", "5 4");
      pth.setAttribute("marker-end", `url(#am-ar${e.primary ? "-p" : ""})`); svg.appendChild(pth);
      if (e.label) { const lp = ge.x != null ? { x: ge.x, y: ge.y } : ge.points[Math.floor(ge.points.length / 2)]; const d = el("div", "am-elabel-d"); d.textContent = e.label; d.style.left = lp.x + "px"; d.style.top = lp.y + "px"; stage.appendChild(d); }
    });
    stage.appendChild(svg);
  }
  function renderGraph(stage, fr) {
    const dir = (fr.focus && fr.focus.dir) || MODEL.dir || "TB";
    const idEl = {};
    fr.nodes.forEach((n) => { const c = card(n); c.style.left = "-9999px"; c.style.top = "0px"; stage.appendChild(c); idEl[n.id] = c; });
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: dir === "LR" ? "LR" : "TB", nodesep: 46, ranksep: 64, marginx: 6, marginy: 6 });
    g.setDefaultEdgeLabel(() => ({}));
    fr.nodes.forEach((n) => { const r = idEl[n.id].getBoundingClientRect(); g.setNode(n.id, { width: Math.round(r.width) || 210, height: Math.round(r.height) || 120 }); });
    (fr.edges || []).forEach((e, i) => { if (idEl[e.from] && idEl[e.to]) g.setEdge(e.from, e.to, e.label ? { width: Math.min(170, e.label.length * 6 + 12), height: 16, labelpos: "c" } : {}, "e" + i); });
    dagre.layout(g);
    let maxY = 0;
    fr.nodes.forEach((n) => { const nd = g.node(n.id); if (!nd) return; const c = idEl[n.id]; c.style.left = (nd.x - nd.width / 2) + "px"; c.style.top = (nd.y - nd.height / 2) + "px"; maxY = Math.max(maxY, nd.y + nd.height / 2); });
    stage.style.minHeight = (maxY + 12) + "px";
    stage.style.minWidth = Math.round((g.graph().width || 0) + 12) + "px"; // lets the stage scroller pan a wide map
    dagreEdges(stage, g, fr.edges);
  }

  function renderSequence(stage, fr) {
    const W = stage.clientWidth || 1000, n = fr.nodes.length || 1;
    const step = Math.min(210, (W - 180) / Math.max(1, n - 1));
    const idEl = {}, xs = {};
    fr.nodes.forEach((nd, i) => { const c = card(nd); c.style.width = "170px"; c.style.left = i * step + "px"; c.style.top = "0px"; stage.appendChild(c); idEl[nd.id] = c; xs[nd.id] = i * step + 85; });
    const top0 = 150, gap = 46, h = top0 + (fr.edges.length + 1) * gap;
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "am-edges"); svg.innerHTML = edgeMarkers();
    fr.nodes.forEach((nd) => { const x = xs[nd.id]; const l = document.createElementNS(NS, "line"); l.setAttribute("class", "am-life"); l.setAttribute("x1", x); l.setAttribute("y1", 70); l.setAttribute("x2", x); l.setAttribute("y2", h - 20); svg.appendChild(l); });
    fr.edges.forEach((e, k) => {
      const x1 = xs[e.from], x2 = xs[e.to]; if (x1 == null || x2 == null) return; const y = top0 + k * gap;
      const l = document.createElementNS(NS, "line"); l.setAttribute("class", "am-edge"); l.setAttribute("x1", x1); l.setAttribute("y1", y); l.setAttribute("x2", x2); l.setAttribute("y2", y);
      if (e.return) l.setAttribute("stroke-dasharray", "5 4"); l.setAttribute("marker-end", "url(#am-ar)"); svg.appendChild(l);
      if (e.label) { const t = document.createElementNS(NS, "text"); t.setAttribute("class", "am-elabel"); t.setAttribute("x", (x1 + x2) / 2); t.setAttribute("y", y - 5); t.setAttribute("text-anchor", "middle"); t.textContent = e.label; svg.appendChild(t); }
    });
    stage.appendChild(svg); stage.style.minHeight = h + "px";
  }

  // radial / free: explicit positions from layout()
  function renderPos(stage, fr) {
    const W = stage.clientWidth || 1000;
    const { pos, height } = layout(fr.shape, fr.nodes, fr.laneOrder, W);
    const idEl = {};
    fr.nodes.forEach((n) => { const c = card(n); const xy = pos[n.id] || { left: 0, top: 0 }; c.style.left = xy.left + "px"; c.style.top = xy.top + "px"; stage.appendChild(c); idEl[n.id] = c; });
    stage.style.minHeight = height + "px";
    drawEdges(stage, fr.edges, idEl);
  }

  function renderStage(stage, fr) {
    stage.innerHTML = ""; stage.style.minHeight = ""; stage.style.minWidth = "";
    if (!fr.nodes.length) return;
    if (fr.shape === "sequence") return renderSequence(stage, fr);
    if (fr.shape === "radial" || fr.shape === "free") return renderPos(stage, fr);
    return renderGraph(stage, fr); // flow / lanes / layers / default → dagre
  }

  // every level fills the same template: crumbs (path above) · title · lede · tags · body · stage
  function draw() {
    const fr = frameAt(path);
    renderCrumbs();
    const n = fr.focus;
    titleEl.textContent = n ? n.label : (MODEL.repo || "System");
    const lede = n ? n.resp : MODEL.summary;
    ledeEl.textContent = lede || ""; ledeEl.style.display = lede ? "" : "none";
    let meta = "";
    if (n) {
      meta = `<span class="am-chip am-chip-kind">${esc(n.kind || ((n.children || []).length ? "subsystem" : "module"))}</span>` +
        (n.tech || []).map((t) => `<span class="am-chip">${esc(t)}</span>`).join("") +
        filesOf(n).map((f) => `<code>${esc(f)}</code>`).join("");
    }
    metaEl.innerHTML = meta; metaEl.style.display = meta ? "" : "none";
    focusEl.innerHTML = ""; focusEl.style.display = "none";
    if (n) {
      const points = (n.points || []).map((p) => `<li>${esc(p)}</li>`).join("");
      focusEl.innerHTML = `<hr class="am-rule">` +
        (points ? `<ul class="am-points">${points}</ul>` :
          (n.detail && n.detail !== n.resp ? `<div class="am-detail">${esc(n.detail)}</div>` : "")) +
        (n.stack ? `<div class="am-sec">Call path</div><pre class="am-stack">${esc(n.stack)}</pre>` : "");
      focusEl.style.display = "block";
    }
    const hint = !fr.nodes.length ? "" : n ? "Inside this part" : "Click a part to go deeper";
    hintEl.textContent = hint; hintEl.style.display = hint ? "" : "none";
    if (fr.nodes.length) { stageWrapEl.style.display = ""; renderStage(stageEl, fr); }
    else { stageWrapEl.style.display = "none"; }
  }

  function renderCrumbs() {
    let acc = [], parts = [{ label: MODEL.repo || "System", to: [] }];
    for (const id of path) { acc = [...acc, id]; const pn = nodeAt(acc); parts.push({ label: pn ? pn.label : id, to: [...acc] }); }
    // root: empty (reserved) row — a lone repo crumb would just duplicate the title below it
    crumbsEl.innerHTML = !path.length ? "" : parts.map((p, i) => i === parts.length - 1
      ? `<span class="am-here">${esc(p.label)}</span>`
      : `<button data-i="${i}">${esc(p.label)}</button><span class="am-sep">/</span>`).join("");
    crumbsEl.querySelectorAll("button").forEach((b) => (b.onclick = () => goTo(parts[+b.dataset.i].to)));
  }

  function navTo(p, push) { path = p; if (push) history.pushState({ p }, "", "#/" + p.join("/")); draw(); }
  function go(id) { if (navigable(nodeAt([...path, id]))) navTo([...path, id], true); }
  function goTo(p) { navTo(p, true); }
  function fromHash() { const raw = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); const ok = []; for (const id of raw) { if (nodeAt([...ok, id])) ok.push(id); else break; } return ok; }

  function mountAsk() {
    document.body.insertAdjacentHTML("beforeend",
      `<button id="am-launch"><span class="am-dot"></span>Ask Claude about this map</button>
       <aside id="am-drawer"><div id="am-dhead"><span class="am-dot"></span>Ask Claude<button id="am-min" title="Minimise">–</button></div>
       <div id="am-body"><div id="am-empty"><div class="g">Ask about this map</div><div class="s">Type a question, or click a part. Answers appear here and in the terminal session that built this map.</div><div id="am-chips"></div></div><div id="am-log"></div></div>
       <form id="am-form"><input id="am-in" autocomplete="off" placeholder="Ask a question…"><button id="am-send">Ask</button></form></aside>`);
    if (location.protocol === "file:" || typeof fetch !== "function") return; // no bridge → no chat, map still renders
    const launch = document.getElementById("am-launch"), drawer = document.getElementById("am-drawer"),
      body = document.getElementById("am-body"), empty = document.getElementById("am-empty"),
      log = document.getElementById("am-log"), chips = document.getElementById("am-chips"),
      form = document.getElementById("am-form"), input = document.getElementById("am-in");
    (function probe(k) { try { fetch("/health").then((r) => { if (r.ok) launch.style.display = "inline-flex"; else if (k) setTimeout(() => probe(k - 1), 500); }).catch(() => k && setTimeout(() => probe(k - 1), 500)); } catch (e) {} })(6);
    const open = () => { drawer.classList.add("open"); launch.style.display = "none"; input.focus(); };
    launch.onclick = open; document.getElementById("am-min").onclick = () => { drawer.classList.remove("open"); launch.style.display = "inline-flex"; };
    (window.ASK_SUGGESTIONS || (MODEL && MODEL.suggestions) || ["Give me a 60-second tour", "Trace one request end to end", "What are the riskiest parts?", "What looks like a dependency but isn't?"]).forEach((s) => { const b = el("button", "am-sug"); b.textContent = s; b.onclick = () => window.askClaude(s); chips.appendChild(b); });
    const bubble = (t, who) => { empty.style.display = "none"; const b = el("div", "am-b " + (who === "you" ? "am-you" : "am-ai")); b.textContent = t; log.appendChild(b); body.scrollTop = body.scrollHeight; return b; };
    const poll = async (id, into) => { for (let i = 0; i < 300; i++) { await new Promise((r) => setTimeout(r, 800)); const j = await (await fetch("/answer?id=" + encodeURIComponent(id))).json(); if (j.done) { into.textContent = j.answer; into.style.opacity = 1; body.scrollTop = body.scrollHeight; return; } } into.textContent = "(timed out)"; };
    window.askClaude = async function (q, ctx) { open(); bubble(q, "you"); const p = bubble("Thinking…", "ai"); p.style.opacity = .6; try { const j = await (await fetch("/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, context: ctx }) })).json(); if (j.answer != null) { p.textContent = j.answer; p.style.opacity = 1; } else if (j.id) await poll(j.id, p); } catch (e) { p.textContent = "(bridge offline)"; } };
    form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ""; window.askClaude(q); });
  }

  window.ArchMap = {
    render(model) {
      MODEL = model;
      const wrap = el("div", "am-wrap");
      wrap.innerHTML = `<div class="am-head am-col"><nav class="am-crumbs"></nav><h1 class="am-title"></h1><div class="am-lede"></div><div class="am-meta"></div></div>` +
        `<div class="am-body am-col am-scroll"></div><p class="am-hint am-col"></p>` +
        `<div class="am-stagewrap am-scroll"><div class="am-stage"></div></div>`;
      document.body.appendChild(wrap);
      crumbsEl = wrap.querySelector(".am-crumbs");
      titleEl = wrap.querySelector(".am-title");
      ledeEl = wrap.querySelector(".am-lede");
      metaEl = wrap.querySelector(".am-meta");
      focusEl = wrap.querySelector(".am-body");
      hintEl = wrap.querySelector(".am-hint");
      stageEl = wrap.querySelector(".am-stage");
      stageWrapEl = wrap.querySelector(".am-stagewrap");
      path = fromHash(); history.replaceState({ p: path }, "", "#/" + path.join("/"));
      window.addEventListener("popstate", (e) => { path = (e.state && e.state.p) || []; draw(); });
      let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 120); });
      draw();                          // map first — never let the chat block it
      try { mountAsk(); } catch (e) {} // chat is an enhancement
    },
  };
})();
