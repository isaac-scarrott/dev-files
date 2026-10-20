// report: runs → a few lines of text, a before/after diff, or a self-contained HTML page of lessons.
// The HTML is built from lessons.mjs: each finding is taught once, in a fixed order (what we see,
// the picture, the number, why it matters, what good looks like, how to fix it, how sure we are).
// A finding with no lesson, no specifics or no marked picture is left out and listed in `left`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSONS } from "./lessons.mjs";
import { METRICS, TYPES, fmt } from "./metrics.mjs";
import { decode } from "./png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEAD = 5; // lessons shown per page; the rest fold into "smaller things"
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TYPE_WORDS = { home: "home page", listing: "results page", detail: "product page", availability: "availability step", cart: "cart", checkout: "checkout", form: "form", table: "table page", article: "article", landing: "marketing page" };

/** Each check's measured standing, written by eval.mjs: { id: { found, of (planted defects), good: { pages, fired, real, relative, false } (well-regarded pages) } }. */
function validation() {
    const file = join(HERE, "../evals/validation.json");
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}
/** How the check behaved on well-regarded pages nobody had altered. */
function standing(g) {
    if (!g) return "";
    if (!g.fired) return `It stayed silent on all ${g.pages} well-regarded pages we tried it on. `;
    const parts = [g.real && `${g.real} a real problem`, g.relative && `${g.relative} a fair choice that differs from the others`, g.false && `${g.false} a false alarm`].filter(Boolean);
    return `It also fired on ${g.fired} of ${g.pages} well-regarded pages; judged by eye, ${parts.join(", ")}. `;
}
function context(run, f) {
    const w = f.evidenceWidth, m = run.widths[w].metrics, ev = f.evidence ?? [];
    const texts = [...new Set(ev.map((e) => (e.text ?? "").trim()).filter((t) => t && t.length <= 60))];
    return { detail: run.widths[w].detail ?? {}, design: !!run.design, m, ref: f.ref ?? null, stats: run.statsByWidth?.[w] ?? {}, n: f.numbers[0], all: f.numbers, ev, width: w, phone: w < 500, pct: (v) => (v == null ? "none" : `${Math.round(v * 100)}%`), quote: (k) => texts.slice(0, k).map((t) => `“${t}”`).join(", ") };
}
/** "share of text set bold: ours 72% at 1440px; Headout 14%, Airbnb 12%" */
function numberWords(n) {
    const label = METRICS[n.metric].label, each = n.each ?? [];
    const unique = new Set(each.map((e) => e.name)).size === each.length && each.length <= 5;
    const refs = !each.length ? "" : unique ? each.map((e) => `${e.name} ${fmt(n.metric, e.value)}`).join(", ") : `the ${each.length} reference pages are between ${fmt(n.metric, n.min)} and ${fmt(n.metric, n.max)}, typically ${fmt(n.metric, n.median)}`;
    return `${label[0].toUpperCase()}${label.slice(1)}: ours ${fmt(n.metric, n.value)} at ${n.width}px${refs ? `; ${refs}` : ""}.`;
}
/** A finding as the report shows it, or null with a reason when it does not meet the standard. */
function lessonOf(run, f) {
    const L = LESSONS[f.id];
    if (!L) return { left: "no lesson entry" };
    let title, see;
    try { const c = context(run, f); title = L.title(c); see = L.see(c); } catch (e) { return { left: `specifics failed (${e.message})` }; }
    if (!see || /undefined|NaN|\bnull\b/.test(`${title} ${see}`)) return { left: "no specifics for this page" };
    if (!f.crop || !existsSync(join(run.dir, "crops", f.crop))) return { left: "no usable marked picture" };
    return { L, title, see };
}
/** A design capture shows an embedded frame (a payment widget, a map) as a plain grey block: said in the caption, so it is not read as a page still loading. */
function standIn(run) {
    const hosts = [...new Set(run.frame?.standIns ?? [])], file = run.firstScreen && join(run.dir, "crops", run.firstScreen);
    if (!hosts.length || !file || !existsSync(file)) return "";
    // only when the stand-in's grey is really in this picture: most captures carry a hidden frame nobody sees
    const img = decode(readFileSync(file));
    let grey = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === 238 && img.data[i + 1] === 238 && img.data[i + 2] === 238) grey++;
    if (grey < 0.02 * img.w * img.h) return "";
    const pay = hosts.some((h) => /pay|stripe|adyen|braintree|checkout/i.test(h));
    return ` The plain grey area is ${pay ? "an embedded payment frame" : "an embedded frame"} (${esc(hosts.join(", "))}), not captured: it is not a loading state.`;
}
const ordered = (runs) => runs.map((r, i) => ({ r, i })).sort((a, b) => TYPES.indexOf(a.r.type) - TYPES.indexOf(b.r.type) || a.i - b.i).map((x) => x.r);

// ---------- text ----------
export function lines(run) {
    const out = [`${run.label ?? run.url}  (${TYPE_WORDS[run.type]}${run.typeAuto === run.type ? "" : `, detected as ${run.typeAuto}`}; compared with ${run.refs.n ? run.refs.pages.map((p) => p.name).join(", ") : "no like-for-like reference"})`];
    for (const w of run.skipped ?? []) out.push(`! ${w}`);
    run.findings.forEach((f, i) => {
        const got = lessonOf({ ...run, dir: run.dir ?? "." }, f);
        const where = f.evidence.slice(0, 2).map((e) => e.sel).join(" | ");
        out.push(`${i + 1}. ${got.left ? `${f.title} (${got.left})` : `${got.title}. ${got.see}`} ${f.numbers.slice(0, 2).map(numberWords).join(" ")}${where ? ` → ${where}` : ""}${f.crop ? `  (crops/${f.crop})` : ""}`);
    });
    for (const h of run.houseFails ?? []) out.push(`house rule failed: ${METRICS[h.metric].label} ${h.rule}, got ${fmt(h.metric, h.value)} at ${h.width}px${h.why ? ` (${h.why})` : ""}`);
    if (!run.findings.length) out.push("nothing found: every check is within the range of the references");
    if (run.notCause.length) out.push(`checked and fine: ${run.notCause.map((n) => n.title).join(" · ")}`);
    if (run.notApplicable?.length) out.push(`not applicable to a design: ${run.notApplicable.map((n) => n.title).join(" · ")}`);
    return out.join("\n");
}

// ---------- diff ----------
export function diff(a, b) {
    const out = [];
    const A = new Map(a.findings.map((f) => [f.id, f])), B = new Map(b.findings.map((f) => [f.id, f]));
    for (const [id, f] of A) if (!B.has(id)) out.push(`fixed: ${f.title}`);
    for (const [id, f] of B) if (!A.has(id)) out.push(`new: ${f.title}. ${f.numbers.slice(0, 2).map(numberWords).join(" ")}`);
    for (const [id, f] of B) { const p = A.get(id); if (p && p.score !== f.score) out.push(`${f.score < p.score ? "better" : "worse"}: ${f.title}. ${numberWords(p.numbers[0])} → ${fmt(f.numbers[0].metric, f.numbers[0].value)}`); }
    for (const [id, f] of B) { const p = A.get(id); if (p && p.score === f.score) out.push(`unchanged: ${f.title}`); }
    if (!out.length) out.push("no findings before or after");
    return { text: out.join("\n"), regressed: b.debt > a.debt };
}

// ---------- html ----------
const CSS = `
:root{--bg:#fafaf9;--panel:#fff;--ink:#1c1917;--muted:#6b6560;--line:#e7e5e4;--mark:#e5243b;--soft:#f5f5f4;--accent:#1d4ed8;--ok:#067647;--okbg:#ecfdf3;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--panel:#1c1b1a;--ink:#f5f5f4;--muted:#a8a29e;--line:#2e2c2a;--soft:#262422;--accent:#93b4ff;--ok:#75e0a7;--okbg:#0f2a1c;--bad:#fda29b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 Georgia,"Iowan Old Style",serif}
main{max-width:1040px;margin:0 auto;padding:32px 20px 96px}
h1,h2,h3,h4,.ui,figcaption,nav,summary,table{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
h1{font-size:30px;line-height:1.2;margin:0 0 8px}h2{font-size:24px;line-height:1.25;margin:72px 0 6px;padding-top:24px;border-top:2px solid var(--ink)}
h3{font-size:20px;line-height:1.3;margin:0 0 12px}h4{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:20px 0 4px;font-weight:600}
p,li{max-width:70ch}p{margin:0 0 12px}a{color:var(--accent)}.muted{color:var(--muted)}.ui{font-size:14px}
.how{background:var(--soft);border-radius:10px;padding:14px 18px;margin:16px 0 28px}.how p{margin:0 0 4px;font-size:15px}
ol.top{padding-left:22px;margin:8px 0 0}ol.top li{margin:0 0 10px}ol.top b{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.lesson{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px;margin:24px 0}
.lesson .n{display:inline-block;min-width:28px;height:28px;line-height:28px;text-align:center;border-radius:14px;background:var(--ink);color:var(--bg);font:600 14px -apple-system,sans-serif;margin-right:10px;vertical-align:2px}
.pics{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:12px 0 4px;align-items:start}
figure{margin:0}figure img{display:block;max-width:100%;max-height:520px;border:1px solid var(--line);border-radius:8px;cursor:zoom-in;background:#fff}
figcaption{font-size:13px;color:var(--muted);margin-top:6px}figcaption b{color:var(--ink)}
img.open{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;object-fit:contain;background:rgba(0,0,0,.88);z-index:9;border:0;border-radius:0;cursor:zoom-out;padding:24px}
.first{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.first img{max-height:380px}.pics.wide{grid-template-columns:1fr}.pics.wide img{max-height:none}.num{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;background:var(--soft);border-radius:8px;padding:10px 14px;margin:8px 0}
.num p{margin:0 0 4px;max-width:none}.none{font-size:14px;color:var(--muted);font-style:italic}
details{margin:20px 0}summary{cursor:pointer;font-weight:600;font-size:15px}details li{margin:0 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.chips span{font:13px -apple-system,sans-serif;background:var(--okbg);color:var(--ok);border-radius:999px;padding:3px 10px}.chips.grey span{background:var(--soft);color:var(--muted)}
table{border-collapse:collapse;width:100%;font-size:14px;margin:12px 0}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500}
.wrap{overflow-x:auto}.pass{color:var(--ok)}.fail{color:var(--bad);font-weight:600}
`;
const SCRIPT = `document.addEventListener("click",(e)=>{const o=document.querySelector("img.open");if(o){o.classList.remove("open");return}if(e.target.tagName==="IMG")e.target.classList.add("open")});document.addEventListener("keydown",(e)=>{if(e.key==="Escape")document.querySelector("img.open")?.classList.remove("open")})`;

function dataUri(path) {
    if (!path || !existsSync(path)) return null;
    return `data:image/${path.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(path).toString("base64")}`;
}
const fig = (path, caption) => { const u = dataUri(path); return u ? `<figure><img src="${u}" alt=""><figcaption>${caption}</figcaption></figure>` : ""; };

/**
 * runs: run objects, each with .dir (where its crops/ folder is). opts: { title, intro (html placed
 * after the summary), fixes ({ checkId: house-specific fix text }) }.
 * One section per page type, in the order a visitor meets them. Within a section a problem is shown
 * once, on the page where it is worst, with the other pages it is on listed under it; its teaching
 * (why it matters, what good looks like) is given the first time it appears in the report.
 * → { html, left: [{ page, check, why }], shown: [{ page, check, type, refType, ref }] }
 */
export function build(runs, opts = {}) {
    const title = opts.title ?? "Page diagnosis";
    const valid = validation(), fixes = opts.fixes ?? {};
    const left = [], shown = [], taught = new Map();
    const nameOf = (run) => run.label ?? run.url;
    const sections = TYPES.map((type) => ({ type, runs: runs.filter((r) => r.type === type) })).filter((s) => s.runs.length).map((sec, si) => {
        const byCheck = new Map();
        for (const run of sec.runs) for (const f of run.findings) {
            const got = lessonOf(run, f);
            if (got.left) { left.push({ page: nameOf(run), check: f.id, why: got.left }); continue; }
            // the like-for-like rule, enforced here as well as where the picture is made
            const ref = f.ref && f.ref.type === run.type && existsSync(join(run.dir, "crops", f.ref.file)) ? f.ref : null;
            (byCheck.get(f.id) ?? byCheck.set(f.id, []).get(f.id)).push({ run, f, ...got, ref });
        }
        const lessons = [...byCheck.entries()].map(([id, list]) => { list.sort((a, b) => b.f.score - a.f.score); return { id, lead: list.find((x) => x.ref) ?? list[0], list, score: list.reduce((a, x) => a + x.f.score, 0), anchor: `s${si}-${id}` }; }).sort((a, b) => b.score - a.score);
        return { ...sec, lessons, anchor: `s${si}` };
    });
    const many = runs.length > 1;
    for (const sec of sections) for (const l of sec.lessons.slice(0, LEAD)) if (!taught.has(l.id)) taught.set(l.id, { anchor: l.anchor, where: TYPE_WORDS[sec.type] });
    const across = new Map();
    for (const sec of sections) for (const l of sec.lessons.slice(0, LEAD)) { const a = across.get(l.id) ?? { score: 0, pages: new Set(), worst: l.lead }; a.score += l.score; for (const x of l.list) a.pages.add(nameOf(x.run)); if (l.lead.f.score > a.worst.f.score) a.worst = l.lead; across.set(l.id, a); }
    const top = [...across.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 5);
    const section = (t) => `${TYPE_WORDS[t][0].toUpperCase()}${TYPE_WORDS[t].slice(1)}${t === "cart" || t === "checkout" ? "" : "s"}`.replace("pages", many ? "pages" : "page").replace(/steps$/, "step");

    let h = `<h1>${esc(title)}</h1>`;
    h += `<div class="how ui"><p><b>How to read this.</b> Each numbered box is one problem, taught as a short lesson: what we see, a picture with the problem boxed in red, the number behind it, why it matters, what good looks like and how to fix it.</p><p>A problem is something our page does that none of the well-regarded pages doing the same job do. The pages compared with are named under each heading.</p><p>Click any picture to enlarge it. A problem found in several places is taught once and referred to after that.</p></div>`;
    if (top.length) h += `<h3>The problems that matter most</h3><ol class="top">${top.map(([id, a]) => `<li><a href="#${taught.get(id).anchor}"><b>${esc(a.worst.L.name)}.</b></a> At its worst: ${esc(a.worst.title[0].toLowerCase() + a.worst.title.slice(1))} (${esc(nameOf(a.worst.run))}).${many ? ` <span class="muted">Found on ${a.pages.size} of the ${runs.length} pages looked at.</span>` : ""}</li>`).join("")}</ol>`;
    else h += `<p>Nothing was found: on every check these pages sit within the range of the well-regarded pages they were compared with.</p>`;
    if (many) h += `<p class="ui muted">Sections: ${sections.map((s) => `<a href="#${s.anchor}">${section(s.type)}</a>`).join(" · ")}</p>`;
    h += opts.intro ?? "";

    for (const sec of sections) {
        const kind = TYPE_WORDS[sec.type], any = sec.runs[0];
        h += `<h2 id="${sec.anchor}">${many ? section(sec.type) : esc(nameOf(any))}</h2>`;
        const refNames = [...new Set(sec.runs.flatMap((r) => r.refs.pages.map((p) => p.name)))];
        h += `<p class="ui muted">${many ? `Looked at: ${sec.runs.map((r) => esc(nameOf(r))).join("; ")}. ` : /^https?:/.test(any.url) ? `<a href="${esc(any.url)}">${esc(any.url)}</a>. ` : ""}${refNames.length ? `Compared with the ${kind}${kind === "cart" || kind === "checkout" ? "" : "s"} of ${refNames.join(", ")}.` : `There is no like-for-like reference for a ${kind}, so no reference pictures are shown and only the general craft checks (type, contrast, spacing, pictures, response) were run, against ${any.refs.craft ?? 0} well-regarded pages of other kinds.`}</p>`;
        for (const run of sec.runs) for (const s of run.skipped ?? []) if (!/nothing to compare against/.test(s)) h += `<p class="none">Not captured (${esc(nameOf(run))}): ${esc(s.replace(/(https?|snapshot|paper):\S+/g, "the page"))}</p>`;
        const firsts = sec.runs.map((run) => (run.firstScreen ? fig(join(run.dir, "crops", run.firstScreen), `${esc(nameOf(run))}: the first screen${run.firstScreenBoxed ? ", largest problems boxed" : ""}.${standIn(run)}`) : `<p class="none">No usable capture of the first screen of ${esc(nameOf(run))}.</p>`));
        h += `<div class="pics first">${firsts.join("")}</div>`;
        if (!sec.lessons.length) h += `<p>Nothing found here.</p>`;
        sec.lessons.slice(0, LEAD).forEach((l, i) => {
            const { f, L, run, ref } = l.lead, t = taught.get(l.id), full = t.anchor === l.anchor;
            const ours = fig(join(run.dir, "crops", f.crop), `<b>Ours</b>${many ? ` (${esc(nameOf(run))})` : ""} at ${f.evidenceWidth}px${L.show === "page" ? ": the whole page cut into screens, read left to right; the red box is the first screen" : ", the problem boxed in red"}.`);
            const theirs = ref ? fig(join(run.dir, "crops", ref.file), `<b>${esc(ref.name)}</b>, the same kind of page${L.show === "cards" ? ": its cards, boxed" : L.show === "page" ? ", at the same scale" : ""}.`) : "";
            if (ref) shown.push({ page: nameOf(run), check: l.id, type: run.type, refType: ref.type, ref: ref.name });
            h += `<div class="lesson" id="${l.anchor}"><h3><span class="n">${i + 1}</span>${esc(l.lead.title)}</h3>`;
            h += `<h4>What we see</h4><p>${esc(l.lead.see)}</p><div class="pics${L.show === "page" ? " wide" : ""}">${ours}${theirs}</div>${theirs || L.show === "spot" ? "" : `<p class="none">No like-for-like reference picture for this one.</p>`}`;
            h += `<h4>The number</h4><div class="num">${f.numbers.slice(0, 3).map((n) => `<p>${esc(numberWords(n))}</p>`).join("")}</div>`;
            const others = l.list.filter((x) => x !== l.lead);
            if (others.length) h += `<h4>Also on</h4><ul class="ui">${others.map((x) => `<li>${esc(nameOf(x.run))}: ${esc(x.title[0].toLowerCase() + x.title.slice(1))}.</li>`).join("")}</ul>`;
            if (full) {
                h += `<h4>Why it matters</h4><p>${esc(L.why)} <span class="muted ui">Source: ${esc(L.source)}</span></p>`;
                h += `<h4>What good looks like</h4><p>${esc(L.good)}</p>`;
                h += `<h4>How to fix it here</h4><p>${esc(fixes[l.id] ?? L.fix)}</p>`;
                const v = valid[l.id];
                h += `<h4>How sure we are</h4><p>${v?.of ? `This check found its defect in ${v.found} of the ${v.of} real pages where the defect was planted on purpose.` : "This check has not yet been tested against planted defects."} ${standing(v?.good)}${run.design ? "This page was measured from a still capture, which is slightly less exact than a live page. " : ""}${esc(L.doubt)}</p>`;
            } else h += `<p class="ui muted">The same problem as on the ${esc(t.where)}: <a href="#${t.anchor}">why it matters, what good looks like and how to fix it</a>.</p>`;
            h += `</div>`;
        });
        if (sec.lessons.length > LEAD) h += `<details><summary>${sec.lessons.length - LEAD} smaller things</summary><ul>${sec.lessons.slice(LEAD).map((l) => `<li><b class="ui">${esc(l.lead.title)}</b> (${esc(l.list.map((x) => nameOf(x.run)).join("; "))}). ${esc(l.lead.see)} ${taught.has(l.id) ? `<a class="ui" href="#${taught.get(l.id).anchor}">The lesson</a>.` : esc(fixes[l.id] ?? l.lead.L.fix)}</li>`).join("")}</ul></details>`;
        const fine = [...new Set(sec.runs.flatMap((r) => r.notCause.map((n) => n.title)))].filter((t) => !sec.lessons.some((l) => l.lead.L.name === t));
        if (fine.length) h += `<h4>Checked and fine</h4><div class="chips">${fine.map((n) => `<span>${esc(n)}</span>`).join("")}</div>`;
        const na = [...new Set(sec.runs.flatMap((r) => (r.notApplicable ?? []).map((n) => `${n.title}`)))];
        if (na.length) h += `<h4>Could not be checked on a still capture</h4><p class="ui muted">A capture of a design cannot respond to the pointer or keyboard, holds no real buttons or inputs, and carries its pictures at Paper's sizes. On ${esc(sec.runs.filter((r) => r.design).map(nameOf).join("; "))} these were neither passed nor failed:</p><div class="chips grey">${na.map((n) => `<span>${esc(n)}</span>`).join("")}</div>`;
        const house = sec.runs.flatMap((r) => (r.houseFails ?? []).map((x) => ({ ...x, page: nameOf(r) })));
        if (house.length) h += `<details><summary>House rules not met (${house.length})</summary><table>${house.map((x) => `<tr><td>${esc(x.page)}</td><td>${esc(METRICS[x.metric].label)}</td><td>should be ${esc(x.rule)}</td><td><b>${fmt(x.metric, x.value)}</b> at ${x.width}px</td><td>${esc(x.why ?? "")}</td></tr>`).join("")}</table></details>`;
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${h}</main><script>${SCRIPT}</script></body></html>`;
    return { html, left, shown };
}
export const html = (runs, opts) => build(runs, opts).html;
