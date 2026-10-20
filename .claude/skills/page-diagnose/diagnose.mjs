#!/usr/bin/env node
// Deterministic design diagnosis of a web page: collect → classify → compare → explain → report.
//
//   node diagnose.mjs <url> [--against <[type=]url…> | --refs <set>] [--type T] [--profile house.json]
//                           [--html out.html] [--json] [--out dir] [--label "…"]
//   node diagnose.mjs refs build <set> <[type=]url…> [--type T] refs/<set>.json; `refs list` names the sets
//   node diagnose.mjs diff <before run.json> <after run.json>  exit 1 when debt rose
//   node diagnose.mjs report <run.json…> --html out.html [--title "…"]
//   --inject file.js|file.css   change the page before measuring (a what-if): CSS is added, JS is a function body
//
// Page types: home, listing, detail, form, table, article (transactional or content) and landing (marketing).
// Auto-detected; --type overrides. A page is only ever compared with references of its own type.
// A page that is blocked, still loading (skeletons, spinners, missing pictures) or blank is not measured.
// Exit: 0 measured · 1 error · 2 a --profile house rule failed · 3 the page could not be measured.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { openBrowser } from "./lib/cdp.mjs";
import { TYPES } from "./lib/metrics.mjs";
import { build, diff, lines } from "./lib/report.mjs";
import { buildRun, collectAll, listRefSets, loadRefSet, saveRefSet, slug, toRefPages } from "./lib/run.mjs";

function parse(argv) {
    const pos = [], flags = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) { pos.push(a); continue; }
        const key = a.slice(2), vals = [];
        while (i + 1 < argv.length && !argv[i + 1].startsWith("--") && (key === "against" || !vals.length) && key !== "json") vals.push(argv[++i]);
        flags[key] = key === "against" ? vals : vals[0] ?? true;
    }
    return { pos, flags };
}
const { pos, flags } = parse(process.argv.slice(2));
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
if (flags.type && !TYPES.includes(flags.type)) fail(`--type must be one of ${TYPES.join(", ")}`);
const inject = flags.inject ? readFileSync(flags.inject, "utf8") : null;
const mutate = inject == null ? undefined : flags.inject.endsWith(".css") ? `() => css(${JSON.stringify(inject)})` : `() => { ${inject} }`;
const house = flags.profile ? JSON.parse(readFileSync(flags.profile, "utf8")) : null;
/** Writes the lesson report; says out loud which findings were left out for not meeting the standard. */
function writeReport(file, runs, title) {
    const r = build(runs, { title, fixes: house?.fixes });
    writeFileSync(file, r.html);
    return [`wrote ${file} (${runs.length} page${runs.length === 1 ? "" : "s"}; look through every picture and pairing before showing it to anyone)`, ...r.left.map((x) => `! left out of the report: ${x.check} on ${x.page} (${x.why})`)].join("\n");
}
const typed = (item) => { const m = item.match(/^([a-z]+)=(.+)$/); return m && TYPES.includes(m[1]) ? { type: m[1], url: m[2] } : { type: null, url: item }; };

async function main() {
    if (pos[0] === "diff") {
        const [a, b] = [pos[1], pos[2]].map((p) => JSON.parse(readFileSync(p, "utf8")));
        const d = diff(a, b);
        console.log(d.text);
        process.exit(d.regressed ? 1 : 0);
    }
    if (pos[0] === "report") {
        if (!flags.html) fail("report needs --html <file>");
        const runs = pos.slice(1).map((p) => ({ ...JSON.parse(readFileSync(p, "utf8")), dir: dirname(resolve(p)) }));
        console.log(writeReport(flags.html, runs, flags.title ?? "Page diagnosis"));
        return;
    }
    if (pos[0] === "refs") {
        if (pos[1] === "list") { console.log(listRefSets().map((n) => { const s = loadRefSet(n); return `${n}: ${s.pages.length} pages (${[...new Set(s.pages.map((p) => p.type))].join(", ")})`; }).join("\n")); return; }
        if (pos[1] !== "build" || !pos[2] || pos.length < 4) fail("usage: diagnose.mjs refs build <set> <url…> [--type T]");
        const browser = await openBrowser();
        const pages = [];
        try {
            for (const item of pos.slice(3)) {
                // "listing=https://…" fixes that page's type; a bare URL is typed by --type or by detection
                const { type, url } = typed(item);
                const p = await collectAll(browser, url, { dir: join(dirname(new URL(import.meta.url).pathname), "refs", pos[2]) });
                p.type = type ?? flags.type ?? p.typeAuto;
                // a reference that did not load cleanly at every width would teach the wrong thing: it is refused
                for (const s of p.skipped) console.log(`! ${s}`);
                if (p.skipped.length || !Object.keys(p.widths).length) { console.log(`! ${url}: not added to the set`); process.exitCode = 3; continue; }
                pages.push(p); console.log(`${url}: ${p.type}`);
            }
        } finally { browser.close(); }
        saveRefSet(pos[2], pages, flags.note);
        console.log(`wrote refs/${pos[2]}.json (${pages.length} pages)`);
        return;
    }
    const url = pos[0];
    if (!url) fail("usage: diagnose.mjs <url> [--against <url…> | --refs <set>] [--type T] [--profile file] [--html out.html] [--json]  (see the header of this file)");
    const dir = resolve(flags.out ?? join(tmpdir(), "page-diagnose", slug(url)));
    mkdirSync(dir, { recursive: true });
    const browser = await openBrowser();
    let page, refs;
    try {
        page = await collectAll(browser, url, { dir, mutate });
        if (!Object.keys(page.widths).length) { console.error(page.skipped.join("\n")); process.exitCode = 3; return; }
        if (flags.against?.length) {
            const pages = [], skipped = [];
            // a reference is only shown beside the page when it is the same type: "listing=https://…" states it, otherwise it is detected
            for (const item of flags.against) { const { type: t, url: u } = typed(item); const p = await collectAll(browser, u, { dir, name: `ref-${slug(u)}` }); skipped.push(...p.skipped); if (t) p.type = t; if (!p.skipped.length) pages.push(p); }
            refs = { label: "--against", pages: toRefPages(pages), dir, skipped };
        }
    } finally { browser.close(); }
    const type = flags.type ?? page.typeAuto;
    let sameTypeOnly = false;
    if (!refs) {
        const name = flags.refs ?? "travel";
        const set = loadRefSet(name);
        refs = { label: name, pages: set.pages, dir: set.dir };
        sameTypeOnly = true;
    }
    const run = buildRun(page, refs, { type, house, dir, label: flags.label, sameTypeOnly });
    writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 1));
    console.log(flags.json ? JSON.stringify(run) : lines({ ...run, dir }));
    if (flags.html) console.error(writeReport(flags.html, [{ ...run, dir }], flags.label ?? `Diagnosis: ${url}`));
    if (!flags.json) console.log(`run: ${join(dir, "run.json")}`);
    if (run.houseFails.length) process.exitCode = 2;
    else if (!run.refs.n) process.exitCode = 3;
}
main().catch((e) => fail(e.stack ?? String(e)));
