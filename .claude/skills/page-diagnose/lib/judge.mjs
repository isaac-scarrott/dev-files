// classify → compare → explain. Pure functions over collected records: no browser, no clock.
import { LESSONS } from "./lessons.mjs";
import { FINDINGS, METRICS, TYPES, fmt, profile } from "./metrics.mjs";

const SEV_CAP = 2; // one check cannot outweigh three others, however far out its number is
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- classify ----------
/** Page type from the collector's signals: { type, scores }. Ties resolve in TYPES order. */
export function classify(s) {
    const path = (s.path ?? "/").toLowerCase(), ld = (s.ldTypes ?? []).join(","), keys = s.queryKeys ?? [];
    const score = Object.fromEntries(TYPES.map((t) => [t, t === "home" ? 1 : 0]));
    const buying = !!(s.buyButtons || s.buyLinks || s.cartLink);
    if (path === "/" || /^\/[a-z]{2}([-_][a-z]{2})?\/?$/i.test(path) || /(^|\/)(index|home)([._-][\w.-]*)?$/.test(path)) score.home += 3;
    if (s.formFields >= 3) score.form += 2 + Math.min(3, s.formFields / 3) - (s.cards >= 4 ? 2 : 0) - (s.words / s.formFields > 150 ? 2 : 0) - (s.longParagraphs >= 3 ? 2 : 0);
    // the booking steps are told apart by address: nothing on the page says "cart" as reliably
    if (/\/(cart|basket|bag)(\/|$)/.test(path)) score.cart += 6;
    else if (/\/(checkout|payment|pay)(\/|$)/.test(path) && !/booking_details|select/.test(path)) score.checkout += 6;
    else if (/\/(book|booking|select|availability|booking_details)(\/|$)/.test(path)) score.availability += 6;
    else if (/\/(contact[\w-]*|enquir[\w-]*)(\/|$)/.test(path)) score.form += 3;
    if (s.tableRows >= 5 && s.tableAreaShare >= 0.1) score.table += 2 + (s.tableAreaShare >= 0.25 ? 2 : 0) + Math.min(2, s.tableRows / 10);
    if (s.longParagraphs >= 3) score.article += 2 + Math.min(2, s.longParagraphs / 4) + (s.paragraphWordShare >= 0.5 ? 1.5 : 0) + (s.articleTag ? 1 : 0) + (/Article|BlogPosting|NewsArticle/.test(ld) ? 2 : 0) + (s.ogType === "article" ? 0.5 : 0)
        - (s.cards >= 6 ? 1.5 : 0) - (s.priceOutsideCards ? 2.5 : 0) - (buying ? 1.5 : 0) - (s.formFields >= 3 ? 1.5 : 0);
    score.detail += (s.buyButtons ? 2 : 0) + (s.priceOutsideCards && s.h1 ? 1.5 : 0) + (s.buyLinks ? 1 : 0) + (s.priceOutsideCards && s.formFields >= 3 ? 1 : 0) + (/Product|Offer|TouristAttraction|TouristTrip|Event|Hotel/.test(ld) ? 2 : 0) + (/product/.test(s.ogType ?? "") ? 2 : 0)
        + (/\/(product|products|p|dp|item|itm|experiences?|tours?|tickets?|trip|events?|attractions?|activity|activities|rooms)\/[^/]+/.test(path) ? 1 : 0) - (s.cardAreaShare > 0.5 ? 1.5 : 0);
    score.listing += (s.cards >= 8 ? 1.5 : s.cards >= 5 ? 1 : 0) + (s.cardAreaShare >= 0.35 ? 1 : 0) + (s.filters ? 2 : 0) + (s.sort ? 1.5 : 0) + (s.pagination ? 0.5 : 0) + (/ItemList|SearchResultsPage|CollectionPage/.test(ld) ? 1.5 : 0)
        + (/\/(search|searchresults|s|category|categories|c|collections?|browse|results|shop|things-to-do[\w-]*)(\/|$)/.test(path) || keys.some((k) => /^(q|query|search|s|k|keyword)$/.test(k)) ? 2 : 0);
    // A page with nothing to search, compare or buy is a marketing page, whatever its address.
    if (s.search !== undefined) {
        const catalogue = (s.search ? 2 : 0) + (s.cards >= 4 && (s.pricedCardShare ?? 0) >= 0.3 ? 2 : 0) + ((s.priceRuns ?? 0) >= 3 ? 1 : 0) + (s.cartLink ? 1.5 : 0) + ((s.bookWords ?? 0) >= 3 ? 2 : 0) + (s.filters ? 1 : 0) + (s.sort ? 1 : 0);
        const pitching = (s.marketingCtas ?? 0) >= 2 && !s.buyButtons && !s.filters && !s.sort;
        if (catalogue < 2 || pitching) score.landing = score.home + (pitching ? 1.5 : 0.5) + (catalogue < 2 && s.marketingCtas ? 1 : 0);
    }
    const type = TYPES.reduce((best, t) => (score[t] > score[best] ? t : best), "home");
    return { type, scores: Object.fromEntries(Object.entries(score).map(([k, v]) => [k, r2(v)])) };
}

// ---------- compare ----------
function quantile(sorted, q) { const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); }
/** Per-metric reference statistics from a list of metrics objects. */
export function referenceStats(list, names = null) {
    const out = {};
    for (const key of Object.keys(METRICS)) {
        const vals = list.map((mm) => mm[key]).filter((v) => typeof v === "number" && !Number.isNaN(v)).sort((a, b) => a - b);
        if (!vals.length) continue;
        out[key] = { n: vals.length, median: r2(quantile(vals, 0.5)), q1: r2(quantile(vals, 0.25)), q3: r2(quantile(vals, 0.75)), min: vals[0], max: vals.at(-1), each: names ? list.map((mm, i) => ({ name: names[i], value: mm[key] })).filter((x) => typeof x.value === "number") : undefined };
    }
    return out;
}
/**
 * How far each metric sits outside its reference, in units of the tolerated band.
 * band = max(absolute slack, relative slack × median, 1.5 × spread); a value inside the
 * references' own range is never a gap. → { key: { value, ref, low, high } } (severities ≥ 0).
 */
export function judge(metrics, stats, width) {
    const out = {};
    const phone = width < 500;
    for (const [key, def] of Object.entries(METRICS)) {
        const value = metrics[key], ref = stats[key];
        if (!def.bad || typeof value !== "number" || !ref) continue;
        if ((def.only === "phone" && !phone) || (def.only === "desktop" && phone)) continue;
        const spread = ref.n >= 4 ? ref.q3 - ref.q1 : ref.n >= 2 ? (ref.max - ref.min) / 2 : 0;
        const band = Math.max(def.abs, def.rel * Math.abs(ref.median), 1.5 * spread, 1e-9);
        const inside = ref.n >= 2 && value >= ref.min && value <= ref.max;
        const sev = (dir) => (inside || (def.bad !== "both" && def.bad !== dir) ? 0 : Math.max(0, r2((dir === "high" ? value - ref.median : ref.median - value) / band)));
        out[key] = { value, ref, low: sev("low"), high: sev("high") };
    }
    return out;
}

/** House rules: [{ metric, max?, min?, equals?, widths?: "phone"|"desktop", why? }] → failures. */
export function checkProfile(house, metrics, width) {
    const fails = [];
    const phone = width < 500;
    for (const rule of house.rules ?? []) {
        if ((rule.widths === "phone" && !phone) || (rule.widths === "desktop" && phone)) continue;
        const v = metrics[rule.metric];
        if (!(rule.metric in METRICS)) throw new Error(`profile "${house.name ?? ""}": unknown metric ${rule.metric}`);
        if (typeof v !== "number") continue;
        const bad = (rule.max !== undefined && v > rule.max) || (rule.min !== undefined && v < rule.min) || (rule.equals !== undefined && v !== rule.equals);
        if (bad) fails.push({ metric: rule.metric, value: v, width, rule: rule.max !== undefined ? `≤ ${fmt(rule.metric, rule.max)}` : rule.min !== undefined ? `≥ ${fmt(rule.metric, rule.min)}` : `= ${fmt(rule.metric, rule.equals)}`, why: rule.why ?? null });
    }
    return fails;
}

// ---------- explain ----------
/**
 * Findings for one page across its widths.
 * page: { type, widths: { [w]: record } }; statsByWidth: { [w]: stats }; house: optional profile.
 * → { findings, notCause, unmeasured, debt, houseFails, judged }
 */
export function explain(page, statsByWidth, house = null) {
    const weights = profile(page.type);
    const widths = Object.keys(page.widths).map(Number).sort((a, b) => b - a);
    const judged = {}, houseFails = [];
    for (const w of widths) {
        judged[w] = judge(page.widths[w].metrics, statsByWidth[w] ?? {}, w);
        if (house) houseFails.push(...checkProfile(house, page.widths[w].metrics, w));
    }
    const findings = [], notCause = [], unmeasured = [];
    for (const [id, def] of Object.entries(FINDINGS)) {
        const weight = weights[id];
        if (!weight) continue;
        const fired = [], calm = [];
        for (const w of widths) for (const spec of def.metrics) {
            const [key, dir] = spec.split(":");
            const j = judged[w][key];
            if (!j) continue;
            const row = { metric: key, dir, width: w, value: j.value, median: j.ref.median, min: j.ref.min, max: j.ref.max, n: j.ref.n, each: j.ref.each, sev: j[dir] };
            (j[dir] >= 1 ? fired : calm).push(row);
        }
        // a house rule that fails is listed on its own (houseFails); a finding is always a gap against the references
        if (!fired.length) { (calm.length ? notCause : unmeasured).push({ id, title: LESSONS[id]?.name ?? id, numbers: calm.slice(0, 2) }); continue; }
        fired.sort((a, b) => b.sev - a.sev || b.width - a.width);
        const lead = fired[0];
        const distinct = new Set(fired.map((x) => x.metric)).size;
        const score = r2(weight * Math.min(lead.sev, SEV_CAP) * (1 + 0.15 * Math.max(0, distinct - 1)));
        const ev = page.widths[lead.width].evidence ?? {};
        const evidence = ev[lead.metric] ?? fired.map((x) => page.widths[x.width].evidence?.[x.metric]).find(Boolean) ?? [];
        findings.push({ id, title: LESSONS[id]?.name ?? id, weight, severity: lead.sev, score, widths: [...new Set(fired.map((x) => x.width))], numbers: dedupe(fired), evidence: evidence.slice(0, 5), evidenceWidth: lead.width });
    }
    findings.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    return { findings, notCause, unmeasured, debt: r2(findings.reduce((a, x) => a + x.score, 0)), houseFails, judged };
}
function dedupe(rows) {
    const seen = new Set();
    return rows.filter((x) => { const k = `${x.metric}@${x.width}`; if (seen.has(k)) return false; seen.add(k); return true; }).map(({ dir, ...rest }) => rest);
}

/** "cards showing a price 0% (refs 100%) @1440" */
export function numberLine(n) {
    const ref = n.n > 1 && n.min !== n.max ? `${fmt(n.metric, n.median)}, ${fmt(n.metric, n.min)}–${fmt(n.metric, n.max)}` : fmt(n.metric, n.median);
    return `${METRICS[n.metric].label} ${fmt(n.metric, n.value)} (refs ${ref}) @${n.width}`;
}
