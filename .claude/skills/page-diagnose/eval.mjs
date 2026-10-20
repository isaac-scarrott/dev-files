#!/usr/bin/env node
// The proof that diagnose.mjs measures what it claims, run on frozen copies of real pages.
// Prints markdown; EVALS.md records a run.
//
//   node eval.mjs capture [--only <regex>]   freeze every page in evals/sites.json to evals/snapshots/<id>/ (needs the network; skips pages already frozen unless --fresh)
//   node eval.mjs planted [--only <regex>]   A  one planted defect per run on real pages: recall and precision per defect
//   node eval.mjs determinism             B  every frozen page measured twice
//   node eval.mjs fidelity [url]          C  the 9 Oct measure.js against this collector, in the same tab
//   node eval.mjs sites                   D  well-regarded against poor, like with like per page type; page-type detection
//   node eval.mjs baseline                E  what is flagged on each untouched well-regarded page, with the recorded judgement
//   node eval.mjs other                   F  marketing and out-of-sector pages: detection, and that they are judged by their own kind
//   node eval.mjs report                  G  the report standard: every shown finding is a full lesson with a marked picture, every reference is like for like
//   node eval.mjs all
//
// Measurements are cached under $DIAGNOSE_EVAL_DIR (default: the OS temp dir) keyed by the collector's
// code, so changing a weight re-judges in seconds and changing the collector measures again. --fresh
// forces a re-measure. $DIAGNOSE_JOBS pages are measured at once (default 3).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openBrowser, openPage } from "./lib/cdp.mjs";
import { CAP, openPrepared } from "./lib/collect.mjs";
import { classify } from "./lib/judge.mjs";
import { LESSONS } from "./lib/lessons.mjs";
import { FINDINGS, KIND, profile } from "./lib/metrics.mjs";
import { build } from "./lib/report.mjs";
import { analyse } from "./lib/pixels.mjs";
import { decode } from "./lib/png.mjs";
import { buildRun, collectAll, toRefPages } from "./lib/run.mjs";
import { saveSnapshot } from "./lib/snapshot.mjs";
import { DEFECTS, PRELUDE, mutationSource } from "./evals/defects.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DIAGNOSE_EVAL_DIR ?? join(tmpdir(), "page-diagnose", "eval");
const SNAP = join(HERE, "evals/snapshots");
const JOBS = +(process.env.DIAGNOSE_JOBS ?? 3);
const args = process.argv.slice(2);
const cmd = args[0] ?? "all";
const flag = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true; };
const FRESH = !!flag("fresh"), ONLY = typeof flag("only") === "string" ? flag("only") : null, ONLY_RE = new RegExp(ONLY ?? ".");
const median = (a) => { const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : null; };
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
const CODE = createHash("sha1").update(["lib/page/core.js", "lib/page/extra.js", "lib/collect.mjs", "lib/pixels.mjs", "lib/cdp.mjs"].map((f) => readFileSync(join(HERE, f), "utf8")).join("\n")).digest("hex").slice(0, 10);

const SITES = JSON.parse(readFileSync(join(HERE, "evals/sites.json"), "utf8"));
const JUDGED = existsSync(join(HERE, "evals/judgements.json")) ? JSON.parse(readFileSync(join(HERE, "evals/judgements.json"), "utf8")) : {};
/** Every page of the set, with its site's group, split and reason folded in, if it has been frozen. */
const PAGES = SITES.pages.map((p) => ({ ...(SITES.sites[p.site] ?? {}), ...p, kind: KIND[p.type], snapshot: `snapshot:${join(SNAP, p.id)}` })).map((p) => ({ ...p, frozen: [1440, 390].every((w) => existsSync(join(SNAP, p.id, `${w}.mhtml`))) }));
const notFrozen = PAGES.filter((p) => !p.frozen);
const USABLE = PAGES.filter((p) => p.frozen);

/** Runs `tasks` (functions returning promises) JOBS at a time, results in order. */
async function pool(tasks) {
    const out = new Array(tasks.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } }));
    return out;
}
/** One frozen page measured at both widths, optionally with a planted defect. Cached. */
async function measure(browser, page, { defect = null, run = 1 } = {}) {
    const name = `${page.id}--${defect?.id ?? "base"}--r${run}`;
    const sig = defect ? createHash("sha1").update(PRELUDE + defect.mutate.toString()).digest("hex").slice(0, 8) : "0";
    const frozen = [1440, 390].map((w) => statSync(join(SNAP, page.id, `${w}.mhtml`)).size).join("-");
    const path = join(DIR, "measure", `${name}--${CODE}-${sig}-${frozen}.json`);
    if (!FRESH && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
    const value = await collectAll(browser, page.snapshot, { dir: join(DIR, "shots"), name, mutate: defect ? mutationSource(defect) : undefined });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
    return value;
}
/** Metric keys (and evidence lists) on which two measurements of one page disagree. */
function disagreements(a, b) {
    const out = [];
    for (const w of Object.keys(a.widths)) {
        const x = a.widths[w], y = b.widths[w];
        if (!y) { out.push(`@${w}: second run did not measure`); continue; }
        for (const k of new Set([...Object.keys(x.metrics), ...Object.keys(y.metrics)])) if (x.metrics[k] !== y.metrics[k]) out.push(`${k}@${w}: ${x.metrics[k]} vs ${y.metrics[k]}`);
        if (JSON.stringify(x.evidence) !== JSON.stringify(y.evidence)) out.push(`evidence@${w}`);
    }
    return out;
}
const usable = (p) => Object.keys(p.widths).length === 2;
/** What the report says under "how sure we are", per check: merged into evals/validation.json; cut checks are dropped. */
function saveValidation(patch) {
    const file = join(HERE, "evals/validation.json"), old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    writeFileSync(file, JSON.stringify(Object.fromEntries(Object.keys(FINDINGS).map((id) => [id, { ...old[id], ...patch[id] }])), null, 1) + "\n");
}

// ---------- capture ----------
async function capture(browser) {
    for (const p of PAGES) for (const w of [1440, 390]) {
        if ((ONLY && !ONLY_RE.test(p.id)) || (!FRESH && existsSync(join(SNAP, p.id, `${w}.mhtml`)))) continue;
        const { page, rec } = await openPrepared(browser, p.url, w, {});
        try {
            if (rec.status !== "ok") { console.log(`${p.id} @${w}: ${rec.status} (${rec.reason}): not frozen`); continue; }
            const got = await saveSnapshot(page, rec, join(SNAP, p.id));
            console.log(`${p.id} @${w}: ${Math.round(got.bytes / 1024)} KB  "${got.title.slice(0, 60)}"`);
        } catch (e) { console.log(`${p.id} @${w}: ${e.message}`); } finally { await page.close(); }
    }
}

// ---------- A: planted defects ----------
async function planted(browser) {
    // bases: the well-regarded pages for the types we build, and every real page of the other types
    const bases = USABLE.filter((p) => (p.group === "good" && ["home", "listing", "detail"].includes(p.type)) || ["form", "availability", "table", "article"].includes(p.type));
    const live = DEFECTS.filter((d) => FINDINGS[d.expect]), cut = DEFECTS.filter((d) => !FINDINGS[d.expect]);
    const jobs = [];
    for (const defect of live) for (const base of bases) if (defect.types.includes(base.type) && (!ONLY || ONLY_RE.test(defect.id) || ONLY_RE.test(base.id))) jobs.push({ defect, base });
    const baseOf = new Map();
    await pool([...new Set(jobs.map((j) => j.base))].map((b) => async () => baseOf.set(b.id, await measure(browser, b))));
    const got = await pool(jobs.map((j) => () => measure(browser, j.base, { defect: j.defect })));
    const rows = jobs.map((j, i) => {
        const m = got[i], note = m.widths[1440]?.mutation ?? m.widths[390]?.mutation;
        if (note?.skip || !usable(m)) return { ...j, skip: note?.skip ?? [...new Set(m.skipped.map((x) => `frozen copy ${x.replace(/^.*@\d+: /, "").replace(/ \(.*$/s, "")}`))].join("; ") };
        const base = baseOf.get(j.base.id);
        const run = buildRun(m, { label: "untouched", pages: toRefPages([base]) }, { type: j.base.type });
        return { ...j, note, findings: run.findings, hit: run.findings.some((f) => f.id === j.defect.expect), top: run.findings[0]?.id === j.defect.expect };
    });
    console.log(`\n## A. Planted defects on real pages (${live.length} defects, ${bases.length} bases, ${rows.filter((r) => !r.skip).length} runs)\n`);
    console.log("Each run plants one defect in a frozen real page and judges it against the same page untouched. found = the planted defect is among the findings; top = it is the largest; others = everything else that fired (side effects of the mutation, or false alarms).\n");
    console.log("| defect | must surface | bases | found (recall) | top | tune bases | held-out bases | other findings (times) | not applicable |\n|---|---|---|---|---|---|---|---|---|");
    const fired = new Map(), firedRight = new Map();
    let all = 0, hits = 0;
    const perSplit = { tune: [0, 0], held: [0, 0] };
    for (const defect of live) {
        const mine = rows.filter((r) => r.defect === defect), ran = mine.filter((r) => !r.skip);
        if (!mine.length) continue;
        const others = new Map();
        for (const r of ran) for (const f of r.findings) {
            fired.set(f.id, (fired.get(f.id) ?? 0) + 1);
            if (f.id === defect.expect) firedRight.set(f.id, (firedRight.get(f.id) ?? 0) + 1); else others.set(f.id, (others.get(f.id) ?? 0) + 1);
        }
        const by = (split) => { const s = ran.filter((r) => r.base.split === split); perSplit[split][0] += s.filter((r) => r.hit).length; perSplit[split][1] += s.length; return s.length ? `${s.filter((r) => r.hit).length}/${s.length}` : "–"; };
        all += ran.length; hits += ran.filter((r) => r.hit).length;
        const missed = ran.filter((r) => !r.hit).map((r) => r.base.id);
        console.log(`| ${defect.id}${defect.split === "held" ? " (held)" : ""} | ${defect.expect} | ${defect.types.join(", ")} | ${ran.filter((r) => r.hit).length}/${ran.length}${missed.length ? ` (missed: ${missed.join(", ")})` : ""} | ${ran.filter((r) => r.top).length}/${ran.length} | ${by("tune")} | ${by("held")} | ${[...others.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(", ") || "–"} | ${mine.filter((r) => r.skip).map((r) => `${r.base.id}: ${r.skip}`).join("; ") || "–"} |`);
    }
    console.log(`\nRecall over all runs: ${hits}/${all} (${pct(hits, all)}). Tuning bases ${perSplit.tune[0]}/${perSplit.tune[1]} (${pct(...perSplit.tune)}); held-out bases ${perSplit.held[0]}/${perSplit.held[1]} (${pct(...perSplit.held)}).`);
    const tuneD = rows.filter((r) => !r.skip && r.defect.split === "tune"), heldD = rows.filter((r) => !r.skip && r.defect.split === "held");
    console.log(`By defect split: tuning defects ${tuneD.filter((r) => r.hit).length}/${tuneD.length} (${pct(tuneD.filter((r) => r.hit).length, tuneD.length)}); held-out defects ${heldD.filter((r) => r.hit).length}/${heldD.length} (${pct(heldD.filter((r) => r.hit).length, heldD.length)}).`);
    const totalFired = [...fired.values()].reduce((a, b) => a + b, 0), totalRight = [...firedRight.values()].reduce((a, b) => a + b, 0);
    console.log(`Strict precision (findings that were the planted defect ÷ all findings fired): ${totalRight}/${totalFired} (${pct(totalRight, totalFired)}). Planted defect ranked first: ${rows.filter((r) => r.top).length}/${all} (${pct(rows.filter((r) => r.top).length, all)}).`);
    console.log("\nPrecision per finding (times it fired because it was planted ÷ times it fired at all):\n\n| finding | fired | planted | precision |\n|---|---|---|---|");
    for (const [id, n] of [...fired.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) console.log(`| ${id} | ${n} | ${firedRight.get(id) ?? 0} | ${pct(firedRight.get(id) ?? 0, n)} |`);
    if (cut.length) console.log(`\nNot run, because their check was cut: ${cut.map((d) => `${d.id} (${d.expect})`).join(", ")}.`);
    // what the report says under "how sure we are"
    if (!ONLY) {
        const v = {};
        for (const r of rows.filter((x) => !x.skip)) { const e = (v[r.defect.expect] ??= { found: 0, of: 0 }); e.of++; if (r.hit) e.found++; }
        saveValidation(v);
    }
    return rows;
}

// ---------- B: determinism ----------
async function determinism(browser) {
    const list = USABLE.filter((p) => !ONLY || ONLY_RE.test(p.id));
    const first = await pool(list.map((p) => () => measure(browser, p)));
    const second = await pool(list.map((p) => () => measure(browser, p, { run: 2 })));
    const flaky = [];
    let values = 0;
    list.forEach((p, i) => { for (const w of Object.values(first[i].widths)) values += Object.keys(w.metrics).length; for (const d of disagreements(first[i], second[i])) flaky.push(`${p.id} ${d}`); });
    console.log(`\n## B. Determinism (${list.length} frozen real pages × 2 widths, each measured twice in separate tabs; ${values} metric values)\n`);
    const perKey = new Map();
    for (const f of flaky) { const k = f.split(" ")[1].split("@")[0]; perKey.set(k, (perKey.get(k) ?? 0) + 1); }
    const read = new Set(Object.values(FINDINGS).flatMap((d) => d.metrics.map((x) => x.split(":")[0])));
    const judged = flaky.filter((f) => read.has(f.split(" ")[1].split("@")[0]));
    console.log(flaky.length ? `Disagreements: ${flaky.length}; in a number a check reads: ${judged.length}${judged.length ? ` (${judged.join("; ")})` : ""}.\n${[...perKey.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n} page-widths`).join("\n")}\n\n${flaky.slice(0, 40).map((f) => `- ${f}`).join("\n")}` : "Flaky list: empty. Every metric and every evidence list is identical across the two runs.");
    return flaky;
}

// ---------- C: port fidelity ----------
async function fidelity(browser, url) {
    const legacyMeasure = readFileSync(join(HERE, "evals/legacy/measure.js"), "utf8"), legacyPixels = readFileSync(join(HERE, "evals/legacy/pixels.js"), "utf8");
    console.log(`\n### ${url.replace(SNAP, "evals/snapshots")}\n`);
    const strip = (o) => { const c = structuredClone(o); delete c.imageRects; delete c.coverRects; return c; };
    function walk(a, b, path, out) {
        if (a === b) return;
        if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") { out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); return; }
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path ? `${path}.${k}` : k, out);
    }
    const leavesOf = (o) => (o !== null && typeof o === "object" ? Object.values(o).reduce((n, v) => n + leavesOf(v), 0) : 1);
    let total = 0, diffs = 0;
    for (const width of [1440, 390]) {
        const { page, rec } = await openPrepared(browser, url, width);
        try {
            if (rec.status !== "ok") { console.log(`${width}: ${rec.status} ${rec.reason}`); continue; }
            await page.evaluate(legacyMeasure);
            for (const mode of ["fold", "full"]) {
                const old = await page.evaluate(`window.__measure({ mode: "${mode}", vh: ${page.height} })`);
                const neu = await page.evaluate(`window.__pdCore({ mode: "${mode}", vh: ${page.height}, legacy: true }).then((r) => r.out)`);
                const now = await page.evaluate(`window.__pdCore({ mode: "${mode}", vh: ${page.height}, cap: ${CAP} }).then((r) => r.out)`);
                const out = [];
                walk(old, neu, "", out);
                const leaves = leavesOf(old);
                total += leaves; diffs += out.length;
                console.log(`- ${width} ${mode}: ${out.length ? `${out.length} DIFFERENCES\n${out.slice(0, 10).map((x) => `  - ${x}`).join("\n")}` : `identical (${leaves} values)`}`);
                const changed = [];
                walk(strip(old), strip(now), "", changed);
                const heads = [...new Set(changed.map((x) => x.split(":")[0].replace(/\.\d+.*$/, "").replace(/\.list.*$/, ".list")))];
                console.log(`  - with the four later definition changes on: ${changed.length ? `differs in ${heads.slice(0, 12).join(", ")}` : "no difference on this page"}`);
                // pixels: the old canvas implementation against the Node port, on one screenshot
                const h = mode === "fold" ? page.height : Math.min(old.pageHeight, CAP);
                const png = await page.screenshot({ x: 0, y: 0, width, height: h });
                const blank = await openPage(browser, { width: 800 });
                try {
                    await blank.evaluate(legacyPixels);
                    const oldPx = await blank.evaluate(`window.__pixels("data:image/png;base64,${png.toString("base64")}", ${JSON.stringify(old.imageRects)}, ${JSON.stringify(old.coverRects)})`);
                    const neuPx = analyse(decode(png), old.imageRects, old.coverRects);
                    delete neuPx.colour.hueCount; delete neuPx.colour.colourCount;
                    delete oldPx.colour.topAccentColours; delete neuPx.colour.topAccentColours; // tie order differs by construction
                    const px = [];
                    walk(oldPx, neuPx, "", px);
                    total += leavesOf(oldPx); diffs += px.length;
                    console.log(`  - pixels: ${px.length ? `${px.length} DIFFERENCES ${px.slice(0, 5).join("; ")}` : `identical (${leavesOf(oldPx)} values)`}`);
                } finally { await blank.close(); }
            }
        } finally { await page.close(); }
    }
    return { total, diffs };
}

// ---------- D: well-regarded against poor, like with like ----------
function auc(good, bad) { let n = 0; for (const b of bad) for (const g of good) n += b > g ? 1 : b === g ? 0.5 : 0; return good.length && bad.length ? n / (good.length * bad.length) : null; }
const TYPES_D = ["home", "listing", "detail"];
/**
 * Scores every page of a type against the well-regarded tuning pages from other sites: structure
 * metrics against those of its own type, craft metrics against all of them (see lib/metrics.mjs).
 */
function scoreType(measured, type, pictures = false) {
    const refs = measured.filter((x) => x.p.group === "good" && x.p.split === "tune" && TYPES_D.includes(x.p.type));
    return measured.filter((x) => x.p.type === type && ["good", "poor"].includes(x.p.group)).map((x) => {
        const r = refs.filter((q) => q.p.site !== x.p.site);
        const run = buildRun(x.m, { label: "well-regarded tuning pages", pages: toRefPages(r.map((q) => ({ ...q.m, type: q.p.type, name: q.p.site }))), dir: join(DIR, "shots") }, { type, sameTypeOnly: true, ...(pictures ? { dir: join(DIR, "runs", x.p.id), shotDir: join(DIR, "shots") } : {}) });
        return { ...x, refs: run.refs.n, run };
    });
}
async function sites(browser) {
    const list = USABLE.filter((p) => ["good", "poor"].includes(p.group));
    const got = await pool(list.map((p) => () => measure(browser, p)));
    const measured = list.map((p, i) => ({ p, m: got[i] })).filter((x) => usable(x.m));
    console.log(`\n## D. Well-regarded against poor, like with like (${measured.length} frozen pages from ${new Set(measured.map((x) => x.p.site)).size} sites)\n`);
    console.log("Debt = sum over findings of gap × weight, against the well-regarded tuning pages of the same page type from other sites. Separation = how often a poor page scores worse than a well-regarded one (100% = always, 50% = chance).\n");
    const summary = [];
    for (const type of TYPES_D) {
        const rows = scoreType(measured, type);
        console.log(`\n### ${type} pages\n\n| page | group | split | refs | debt | largest findings |\n|---|---|---|---|---|---|`);
        for (const r of rows.sort((a, b) => (a.p.group + a.p.split < b.p.group + b.p.split ? -1 : a.p.group + a.p.split > b.p.group + b.p.split ? 1 : a.run.debt - b.run.debt))) console.log(`| ${r.p.id} | ${r.p.group} | ${r.p.split} | ${r.refs} | ${r.run.debt} | ${r.run.findings.slice(0, 4).map((f) => `${f.title} [${f.score}]`).join("; ") || "none"} |`);
        for (const split of ["tune", "held"]) {
            const g = rows.filter((r) => r.p.group === "good" && r.p.split === split), b = rows.filter((r) => r.p.group === "poor" && r.p.split === split);
            const gs = g.map((r) => r.run.debt), bs = b.map((r) => r.run.debt);
            // held-out poor pages are also compared with the tuning well-regarded pages when the held-out set has too few
            const worstGood = Math.max(...gs, -Infinity), bestPoor = Math.min(...bs, Infinity);
            const missPoor = b.filter((r) => r.run.debt <= worstGood).map((r) => `${r.p.id} (${r.run.debt})`), missGood = g.filter((r) => r.run.debt >= bestPoor).map((r) => `${r.p.id} (${r.run.debt})`);
            summary.push({ type, split, good: gs, poor: bs, auc: auc(gs, bs), missPoor, missGood });
        }
    }
    // which findings carry the separation: how often each fires per group, and its mean score when it does
    const allRows = TYPES_D.flatMap((type) => scoreType(measured, type)), cell = new Map();
    for (const r of allRows) for (const f of r.run.findings) { const k = `${f.id}|${r.p.group}|${r.p.split}`; const c = cell.get(k) ?? { n: 0, sum: 0 }; c.n++; c.sum += f.score; cell.set(k, c); }
    const groups = [["good", "tune"], ["poor", "tune"], ["good", "held"], ["poor", "held"]], size = (g, sp) => allRows.filter((r) => r.p.group === g && r.p.split === sp).length;
    console.log(`\n### Findings by group (pages it fired on, mean score when fired)\n\n| finding | ${groups.map(([g, sp]) => `${g} ${sp} (${size(g, sp)})`).join(" | ")} |\n|---|---|---|---|---|`);
    for (const id of [...new Set([...cell.keys()].map((k) => k.split("|")[0]))].sort()) console.log(`| ${id} | ${groups.map(([g, sp]) => { const c = cell.get(`${id}|${g}|${sp}`); return c ? `${c.n} · ${(c.sum / c.n).toFixed(1)}` : "0"; }).join(" | ")} |`);
    console.log("\n### Separation per page type\n\n| page type | split | well-regarded debts | poor debts | separation | poor pages scoring no worse than a well-regarded one | well-regarded pages scoring no better than a poor one |\n|---|---|---|---|---|---|---|");
    for (const s of summary) console.log(`| ${s.type} | ${s.split} | ${s.good.sort((a, b) => a - b).join(", ") || "–"} (median ${median(s.good) ?? "–"}) | ${s.poor.sort((a, b) => a - b).join(", ") || "–"} (median ${median(s.poor) ?? "–"}) | ${s.auc == null ? "n/a" : pct(s.auc * 100, 100)} | ${s.missPoor.join(", ") || "none"} | ${s.missGood.join(", ") || "none"} |`);
    // page-type detection over everything frozen
    const everything = USABLE.filter((p) => !["good", "poor"].includes(p.group));
    const more = await pool(everything.map((p) => () => measure(browser, p)));
    const allMeasured = [...measured, ...everything.map((p, i) => ({ p, m: more[i] })).filter((x) => usable(x.m))];
    for (const x of allMeasured) { const c = classify(x.m.widths[1440].signals); x.m.typeAuto = c.type; x.m.typeScores = c.scores; }
    const wrongType = allMeasured.filter((x) => x.m.typeAuto !== x.p.type), wrongKind = allMeasured.filter((x) => KIND[x.m.typeAuto] !== x.p.kind);
    console.log(`\n### Page-type detection (${allMeasured.length} pages)\n\nType detected correctly: ${allMeasured.length - wrongType.length}/${allMeasured.length}. Marketing / transactional / content detected correctly: ${allMeasured.length - wrongKind.length}/${allMeasured.length}.`);
    if (wrongType.length) console.log(`\n| page | labelled | detected | scores |\n|---|---|---|---|\n${wrongType.map((x) => `| ${x.p.id} | ${x.p.type} (${x.p.kind}) | ${x.m.typeAuto} (${KIND[x.m.typeAuto]}) | ${Object.entries(x.m.typeScores).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ")} |`).join("\n")}`);
    return { summary, measured };
}

// ---------- E: what is flagged on the untouched well-regarded pages ----------
async function baseline(browser) {
    const list = USABLE.filter((p) => ["good", "poor"].includes(p.group));
    const got = await pool(list.map((p) => () => measure(browser, p)));
    const measured = list.map((p, i) => ({ p, m: got[i] })).filter((x) => usable(x.m));
    console.log(`\n## E. Findings on the untouched well-regarded pages\n`);
    console.log("Each well-regarded page judged against the well-regarded tuning pages of its type from other sites. Verdicts were made by looking at the cropped screenshot of each finding (evals/judgements.json): real = a designer would agree; false = the page is fine and the tool is wrong; relative = true as a difference from the references, not a defect.\n");
    console.log("| page | finding | score | the numbers | verdict |\n|---|---|---|---|---|");
    const tally = { real: 0, false: 0, relative: 0, unjudged: 0 }, good = {};
    for (const type of TYPES_D) for (const r of scoreType(measured.filter((x) => x.p.group === "good"), type, true)) {
        for (const id of Object.keys(profile(type))) (good[id] ??= { pages: 0, fired: 0, real: 0, relative: 0, false: 0, unjudged: 0 }).pages++;
        if (!r.run.findings.length) console.log(`| ${r.p.id} | none | – | – | – |`);
        for (const f of r.run.findings) {
            const v = JUDGED[`${r.p.id}:${f.id}`];
            tally[v?.verdict ?? "unjudged"]++; good[f.id].fired++; good[f.id][v?.verdict ?? "unjudged"]++;
            const n = f.numbers[0];
            console.log(`| ${r.p.id} | ${f.title} | ${f.score} | ${n.metric} ${n.value} (refs ${n.median}${n.n > 1 ? `, ${n.min}–${n.max}` : ""}) @${n.width} | ${v ? `**${v.verdict}**: ${v.why}` : "not judged"} |`);
        }
    }
    console.log(`\nVerdicts: ${tally.real} real, ${tally.relative} relative, ${tally.false} false positive${tally.unjudged ? `, ${tally.unjudged} not judged` : ""}. Pictures: ${join(DIR, "runs")}/<page>/crops`);
    console.log("\n| check | well-regarded pages it applies to | fired | real | relative | false |\n|---|---|---|---|---|---|");
    for (const [id, g] of Object.entries(good)) console.log(`| ${id} | ${g.pages} | ${g.fired} | ${g.real} | ${g.relative} | ${g.false} |`);
    if (!tally.unjudged) saveValidation(Object.fromEntries(Object.entries(good).map(([id, { unjudged, ...g }]) => [id, { good: g }])));
}

// ---------- F: marketing and out-of-sector pages ----------
async function other(browser) {
    const list = USABLE.filter((p) => p.group === "other");
    const got = await pool(list.map((p) => () => measure(browser, p)));
    const measured = list.map((p, i) => ({ p, m: got[i] })).filter((x) => usable(x.m));
    const goodHomes = USABLE.filter((p) => p.group === "good" && p.split === "tune" && p.type === "home");
    const homeRefs = (await pool(goodHomes.map((p) => () => measure(browser, p)))).map((m) => ({ ...m, type: "home" }));
    console.log(`\n## F. Marketing and out-of-sector pages (${measured.length} pages; never tuned on)\n`);
    console.log("| page | sector | labelled | detected | debt against its own kind | debt if judged as a transactional home | findings a transactional home would add |\n|---|---|---|---|---|---|---|");
    for (const x of measured) {
        const peers = measured.filter((q) => q.p.type === x.p.type && q !== x);
        const own = peers.length ? buildRun(x.m, { label: "peers", pages: toRefPages(peers.map((q) => ({ ...q.m, type: x.p.type }))) }, { type: x.p.type }) : null;
        const asHome = x.p.type === "landing" ? buildRun(x.m, { label: "homes", pages: toRefPages(homeRefs) }, { type: "home" }) : null;
        const extra = asHome ? asHome.findings.filter((f) => !own?.findings.some((g) => g.id === f.id)).map((f) => f.title) : [];
        console.log(`| ${x.p.id} | ${x.p.sector} | ${x.p.type} (${x.p.kind}) | ${x.m.typeAuto} (${KIND[x.m.typeAuto]}) | ${own ? `${own.debt} (${peers.length} peers)` : "no peer"} | ${asHome ? asHome.debt : "–"} | ${extra.join("; ") || "–"} |`);
    }
}

// ---------- G: the report standard ----------
/** Fails when a report over a small fixed set shows a finding without a lesson, specifics or a marked picture, or a reference of another page type. */
async function report(browser) {
    const ids = SITES.reportGuard, list = USABLE.filter((p) => ids.includes(p.id) || (p.group === "good" && p.split === "tune" && TYPES_D.includes(p.type)));
    const got = await pool(list.map((p) => () => measure(browser, p)));
    const measured = list.map((p, i) => ({ p, m: got[i] })).filter((x) => usable(x.m));
    const runs = TYPES_D.flatMap((type) => scoreType(measured, type, true)).filter((r) => ids.includes(r.p.id)).map((r) => ({ ...r.run, label: r.p.id, dir: join(DIR, "runs", r.p.id) }));
    const out = build(runs, { title: "Report standard guard" });
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, "report-guard.html"), out.html);
    const problems = [];
    for (const run of runs) for (const f of run.findings) {
        const L = LESSONS[f.id];
        if (!L) { problems.push(`${run.label}: ${f.id} has no lesson entry`); continue; }
        for (const k of ["name", "title", "see", "why", "good", "fix", "doubt", "source", "show"]) if (!L[k]) problems.push(`${f.id}: lesson has no "${k}"`);
    }
    // everything the report shows must be a full lesson; whatever it left out is named, never shown half-made
    const boxes = out.html.split('<div class="lesson"').slice(1), shownIds = boxes.length;
    for (const box of boxes) { if (!/<h4>What we see<\/h4><p>[^<]{20,}/.test(box)) problems.push("a shown finding has no specifics sentence"); if (!/<figure><img src="data:image\/png/.test(box)) problems.push("a shown finding has no marked picture"); if (!/<h4>The number<\/h4>/.test(box)) problems.push("a shown finding has no number"); if (!/How to fix it here|how to fix it<\/a>/.test(box)) problems.push("a shown finding has neither its lesson nor a link to it"); }
    for (const run of runs) for (const f of run.findings) if (f.crop && (f.evidence ?? []).filter((e) => e.covered).length * 2 > (f.evidence ?? []).length) problems.push(`${run.label}: ${f.id} is pictured although most of what it marks lies under something else`);
    for (const x of out.shown) if (x.type !== x.refType) problems.push(`${x.page}: ${x.check} is shown beside a ${x.refType} reference (${x.ref}), but the page is a ${x.type}`);
    if (/\bdebt\b|undefined|NaN/.test(out.html.replace(/data:image[^"]+/g, ""))) problems.push("the report contains an unexplained term or a missing value");
    console.log(`\n## G. Report standard (${runs.length} pages: ${ids.join(", ")})\n`);
    console.log(`Findings shown as lessons: ${shownIds}; left out for not meeting the standard: ${out.left.length}${out.left.length ? ` (${out.left.map((x) => `${x.check} on ${x.page}: ${x.why}`).join("; ")})` : ""}; reference pictures shown: ${out.shown.length}, all of the page's own type: ${out.shown.every((x) => x.type === x.refType) ? "yes" : "NO"}.`);
    console.log(problems.length ? `FAILED:\n${[...new Set(problems)].map((x) => `- ${x}`).join("\n")}` : `Passed. Report: ${join(DIR, "report-guard.html")}`);
    if (problems.length) process.exitCode = 1;
}

if (notFrozen.length && cmd !== "capture") console.log(`Not frozen, so left out: ${notFrozen.map((p) => p.id).join(", ")}. Run: node eval.mjs capture`);
const browser = await openBrowser();
try {
    if (cmd === "capture") await capture(browser);
    if (cmd === "planted" || cmd === "all") await planted(browser);
    if (cmd === "determinism" || cmd === "all") await determinism(browser);
    if (cmd === "fidelity" || cmd === "all") {
        console.log("\n## C. Port fidelity: the 9 Oct measure.js and pixels.js against this collector, same tab, same moment");
        const given = cmd === "fidelity" && args[1] && !args[1].startsWith("--") ? [args[1]] : USABLE.filter((p) => SITES.fidelity.includes(p.id)).map((p) => p.snapshot);
        let total = 0, diffs = 0;
        for (const url of given) { const r = await fidelity(browser, url); total += r.total; diffs += r.diffs; }
        console.log(`\nPorted values compared: ${total}; differing: ${diffs}.`);
    }
    if (cmd === "sites" || cmd === "all") await sites(browser);
    if (cmd === "baseline" || cmd === "all") await baseline(browser);
    if (cmd === "other" || cmd === "all") await other(browser);
    if (cmd === "report" || cmd === "all") await report(browser);
} finally { browser.close(); }
