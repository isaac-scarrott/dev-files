// Glue shared by diagnose.mjs and eval.mjs: collect a page at each width, load or build
// reference sets, and assemble a run (the unit that reports and diffs work on).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA, collectPage } from "./collect.mjs";
import { classify, explain, referenceStats } from "./judge.mjs";
import { writePictures } from "./pictures.mjs";
import { KIND, isStructure } from "./metrics.mjs";
import { exportFrame, isPaper } from "./paper.mjs";
import { tmpdir } from "node:os";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const REFS_DIR = join(ROOT, "refs");
export const WIDTHS = [1440, 390];
export const slug = (url) => url.replace(/^https?:\/\//, "").replace(/^paper:[^/]*\//, "paper-").replace(/^snapshot:(.*\/)?/, "snapshot-").replace(/[?#].*$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "page";

/** → { url, widths: { [w]: record }, skipped: ["390: blocked …"] } */
export async function collectAll(browser, url, opts = {}) {
    const page = { url, widths: {}, skipped: [] };
    // a Paper frame is one design at one width
    const frame = isPaper(url) ? await exportFrame(url, opts.dir ?? join(tmpdir(), "page-diagnose", "frames"), opts.name ?? slug(url)) : null;
    if (frame) { page.design = true; page.frame = { name: frame.name, width: frame.width, height: frame.height, notes: frame.notes, standIns: frame.standIns }; }
    for (const w of frame ? [frame.width] : WIDTHS) {
        const rec = await collectPage(browser, url, w, { dir: opts.dir, name: opts.name ?? slug(url), mutate: opts.mutate, frame });
        if (rec.status === "ok") page.widths[w] = rec;
        else page.skipped.push(`${url} @${w}: ${rec.status} (${rec.reason})`);
    }
    const first = page.widths[Math.max(...Object.keys(page.widths).map(Number))]; // the widest: phone layouts hide what tells types apart
    if (first?.source) page.source = first.source;
    if (first) { const c = classify(first.signals); page.typeAuto = c.type; page.typeScores = c.scores; }
    return page;
}

// ---------- reference sets ----------
export function loadRefSet(name) {
    const file = existsSync(name) ? name : join(REFS_DIR, `${name}.json`);
    if (!existsSync(file)) throw new Error(`no reference set "${name}" (have: ${listRefSets().join(", ") || "none"}); build one with: diagnose.mjs refs build ${name} <url…>`);
    const set = JSON.parse(readFileSync(file, "utf8"));
    if (set.schema !== SCHEMA) throw new Error(`reference set ${name} has schema ${set.schema}, this tool writes ${SCHEMA}: rebuild it`);
    return { ...set, dir: join(dirname(file), set.name) };
}
export const listRefSets = () => (existsSync(REFS_DIR) ? readdirSync(REFS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);
const siteName = (url) => { try { const h = new URL(url).hostname.replace(/^www\./, "").split("."); const n = h.length > 2 && h.at(-2).length <= 3 ? h.at(-3) : h.at(-2) ?? h[0]; return n[0].toUpperCase() + n.slice(1); } catch { return url.replace(/^(snapshot|paper):/, "").split("/").filter(Boolean).pop(); } };
/** Pages → the form a set stores: the metrics, where each page's pictures are, and what to mark on them. */
export function toRefPages(pages) {
    return pages.filter((p) => Object.keys(p.widths).length).map((p) => ({
        url: p.source ?? p.url, name: p.name ?? siteName(p.source ?? p.url), type: p.type ?? p.typeAuto,
        widths: Object.fromEntries(Object.entries(p.widths).map(([w, r]) => [w, { metrics: r.metrics, viewport: r.viewport, capture: r.capture, evidence: r.evidence }])),
        files: Object.fromEntries(Object.entries(p.widths).filter(([, r]) => r.files).map(([w, r]) => [w, r.files])),
    }));
}
export function saveRefSet(name, pages, note) {
    mkdirSync(REFS_DIR, { recursive: true });
    const set = { schema: SCHEMA, name, note: note ?? null, pages: toRefPages(pages) };
    writeFileSync(join(REFS_DIR, `${name}.json`), JSON.stringify(set, null, 1));
    return set;
}

// ---------- a run ----------
/**
 * page: from collectAll (type optional); refs: { label, pages (ref form), dir? }.
 * opts: { type, house, dir (pictures are written to <dir>/crops), shotDir (where the page's screenshots are; default dir), label, sameTypeOnly }.
 */
export function buildRun(page, refs, opts = {}) {
    const type = opts.type ?? page.type ?? page.typeAuto;
    const skipped = [...(page.skipped ?? []), ...(refs.skipped ?? [])];
    // From a saved set: structure metrics against the set's pages of this type, craft metrics
    // against its pages of this kind. From --against: everything against exactly the pages given.
    let refPages = refs.pages, craftPages = refs.pages;
    if (opts.sameTypeOnly) {
        refPages = refs.pages.filter((p) => p.type === type);
        craftPages = refs.pages.filter((p) => KIND[p.type] === KIND[type]);
        if (!refPages.length) skipped.push(`reference set "${refs.label}" has no ${type} pages: nothing to compare against`);
    }
    const statsByWidth = {};
    for (const w of Object.keys(page.widths)) {
        // a frame of an odd width (a 748px dialog) is judged against the references of its width class
        const at = (p) => (p.widths[w] ?? p.widths[Object.keys(p.widths).map(Number).find((x) => x < 500 === +w < 500)])?.metrics;
        const stats = (pages) => { const got = pages.map((p) => ({ m: at(p), name: p.name })).filter((x) => x.m); return referenceStats(got.map((x) => x.m), got.map((x) => x.name)); };
        const own = stats(refPages), craft = stats(craftPages);
        statsByWidth[w] = Object.fromEntries(Object.keys({ ...own, ...craft }).map((k) => [k, isStructure(k) ? own[k] : craft[k]]).filter(([, v]) => v));
    }
    const ex = explain({ type, widths: page.widths }, statsByWidth, opts.house ?? null);
    // a design has no behaviour and no form controls: those checks are not applicable, neither passed nor failed
    const DESIGN_NA = ["static", "no-focus", "zooming-inputs", "competing-actions", "hidden-actions", "soft-images"];
    const notApplicable = page.design ? [...ex.findings, ...ex.notCause, ...ex.unmeasured].filter((x) => DESIGN_NA.includes(x.id)).map((x) => ({ id: x.id, title: x.title })) : [];
    if (page.design) for (const k of ["findings", "notCause", "unmeasured"]) ex[k] = ex[k].filter((x) => !DESIGN_NA.includes(x.id));
    if (page.design) ex.debt = Math.round(ex.findings.reduce((a, x) => a + x.score, 0) * 100) / 100;
    const first = opts.dir ? writePictures(page, ex.findings, { pages: refPages, dir: refs.dir ?? opts.dir }, { dir: join(opts.dir, "crops"), shotDir: opts.shotDir ?? opts.dir, type }) : null;
    return {
        schema: SCHEMA, tool: "page-diagnose", url: page.url, label: opts.label ?? null, type, typeAuto: page.typeAuto, typeScores: page.typeScores,
        refs: { label: refs.label, n: refPages.length, craft: craftPages.length, dir: refs.dir ?? null, pages: refPages.map((p) => ({ url: p.url, name: p.name, type: p.type })) }, firstScreen: first?.file ?? null, firstScreenBoxed: first?.boxed ?? false,
        profile: opts.house?.name ?? null, skipped, debt: ex.debt, findings: ex.findings, notCause: ex.notCause, unmeasured: ex.unmeasured, houseFails: ex.houseFails, design: !!page.design, frame: page.frame ?? null, notApplicable,
        statsByWidth, judged: ex.judged, widths: page.widths, dir: opts.dir ?? null,
    };
}
