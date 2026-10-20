// The pictures a report teaches with: our page cropped to the problem and marked, and beside it a
// reference of the same page type cropped to the same kind of thing. A picture that comes out blank
// is not written, and a reference of another page type is never used.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LESSONS } from "./lessons.mjs";
import { FINDINGS } from "./metrics.mjs";
import { crop, decode, encode, outline, shrink } from "./png.mjs";

/** True when nearly every pixel is one colour: a failed capture or an empty stretch, never evidence. */
export function isBlank(img) {
    const bins = new Uint32Array(4096);
    let top = 0;
    for (let i = 0; i < img.data.length; i += 4) { const n = ++bins[((img.data[i] >> 4) << 8) | ((img.data[i + 1] >> 4) << 4) | (img.data[i + 2] >> 4)]; if (n > top) top = n; }
    return top / (img.w * img.h) >= 0.985;
}
const shots = new Map();
function load(dir, file) {
    const path = dir && file ? join(dir, file) : null;
    if (!path) return null;
    if (!shots.has(path)) { try { shots.set(path, existsSync(path) ? decode(readFileSync(path)) : null); } catch { shots.set(path, null); } }
    return shots.get(path);
}
// A box is drawn outside what it marks, so it never covers the first or last letter. A run's rectangle holds its
// letters with room to spare above and below but none at the sides, and the next line of text starts right under it:
// the box stands off 3px sideways and 1px up and down.
const GAP_X = 3, GAP_Y = 1;
function mark(img, r, ox, oy, t) { outline(img, r[0] - ox - GAP_X - t, r[1] - oy - GAP_Y - t, r[2] + 2 * (GAP_X + t), r[3] + 2 * (GAP_Y + t), undefined, t); }
/** Runs whose boxes would cross (a price set as "£26", ".00", "GBP") become one rectangle: each box would otherwise be drawn through its neighbour's letters. */
function joined(rects, t) {
    const gx = GAP_X + t, gy = GAP_Y + t, out = [];
    for (let r of rects) {
        for (let i = 0; i < out.length; i++) {
            const o = out[i];
            if (r[0] - gx >= o[0] + o[2] + gx || o[0] - gx >= r[0] + r[2] + gx || r[1] - gy >= o[1] + o[3] + gy || o[1] - gy >= r[1] + r[3] + gy) continue;
            const x = Math.min(r[0], o[0]), y = Math.min(r[1], o[1]);
            r = [x, y, Math.max(r[0] + r[2], o[0] + o[2]) - x, Math.max(r[1] + r[3], o[1] + o[3]) - y];
            out.splice(i, 1); i = -1; // the larger rectangle may now reach one already passed
        }
        out.push(r);
    }
    return out;
}
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/**
 * Crop around rects that sit near each other, every rect inside the crop boxed. The crop is padded on
 * every side, kept inside the page, and never smaller than a picture someone can read. `used` holds the
 * crops already shown for this page: a stretch not shown yet is preferred, so two lessons do not share a picture.
 */
function spot(shot, rects, used = [], maxW = 1440, maxH = 700) {
    // only what is actually drawn can be pointed at: a box around an empty patch teaches nothing
    rects = rects.filter((r) => r[1] < shot.h && r[2] > 0 && r[3] > 0 && !isBlank(crop(shot, r[0], r[1], r[2], r[3])));
    if (!rects.length) return null;
    const PAD = 32, boxAt = (first) => {
        const near = rects.filter((r) => Math.abs(r[1] - first[1]) < maxH - 2 * PAD && Math.abs(r[0] - first[0]) < maxW - 2 * PAD).slice(0, 5);
        const x0 = Math.min(...near.map((r) => r[0])), y0 = Math.min(...near.map((r) => r[1])), x1 = Math.max(...near.map((r) => r[0] + r[2])), y1 = Math.max(...near.map((r) => r[1] + r[3]));
        // widen to the floor about the marks' middle (from their start, when they are more than fits), then slide back inside the page
        const span = (lo, hi, floor, max, limit) => { const want = hi - lo + 2 * PAD, size = Math.min(limit, max, Math.max(floor, want)); return [Math.round(Math.max(0, Math.min(limit - size, want > size ? lo - PAD : (lo + hi) / 2 - size / 2))), size]; };
        let [x, w] = span(x0, x1, 640, maxW, shot.w);
        const wide = w > 760; // shown at half size, so it is cut twice as large: the page's whole width
        if (wide) [x, w] = span(x0, x1, maxW, maxW, shot.w);
        const [y, h] = span(y0, y1, wide ? 600 : 300, maxH, shot.h);
        return { x, y, w, h };
    };
    const boxes = rects.map(boxAt), box = boxes.find((b) => !used.some((u) => overlap(b, u) > 0.5 * Math.min(b.w * b.h, u.w * u.h))) ?? boxes[0];
    used.push(box);
    const img = crop(shot, box.x, box.y, box.w, box.h);
    for (const r of joined(rects.filter((r) => overlap({ x: r[0], y: r[1], w: r[2], h: r[3] }, box) >= 0.5 * r[2] * r[3]), 3)) mark(img, r, box.x, box.y, 3);
    return img.w > 760 ? shrink(img, 2) : img;
}
function fold(shot, vh, rects) {
    const img = crop(shot, 0, 0, shot.w, Math.min(vh, shot.h));
    const shown = joined(rects.filter((r) => r[1] < vh).slice(0, 5).map((r) => [r[0], r[1], r[2], Math.min(r[3], vh - r[1])]), 4);
    for (const r of shown) mark(img, r, 0, 0, 4);
    return Object.assign(img.w > 760 ? shrink(img, 2) : img, { boxed: shown.length > 0 });
}
/** The whole page as a filmstrip: cut into screens, shrunk, laid left to right, the first one boxed. Two pages at the same scale show their lengths at a glance. */
function strip(shot, vh) {
    const wide = shot.w > 760, k = wide ? 4 : 2, cols = wide ? 3 : 6, gap = 8;
    const n = Math.min(12, Math.ceil(shot.h / vh)), tw = Math.floor(shot.w / k), th = Math.floor(vh / k), rows = Math.ceil(n / cols);
    const out = { w: cols * tw + (cols + 1) * gap, h: rows * th + (rows + 1) * gap, data: new Uint8Array((cols * tw + (cols + 1) * gap) * (rows * th + (rows + 1) * gap) * 4).fill(238) };
    for (let i = 0; i < n; i++) {
        const tile = shrink(crop(shot, 0, i * vh, shot.w, Math.min(vh, shot.h - i * vh)), k), x0 = gap + (i % cols) * (tw + gap), y0 = gap + Math.floor(i / cols) * (th + gap);
        for (let y = 0; y < tile.h; y++) out.data.set(tile.data.subarray(y * tile.w * 4, (y + 1) * tile.w * 4), ((y0 + y) * out.w + x0) * 4);
        if (i === 0) outline(out, x0 - 2, y0 - 2, tw + 4, th + 4, undefined, 3);
    }
    return out;
}
function picture(show, shot, vh, rects, used) {
    if (!shot) return null;
    const img = show === "page" ? strip(shot, vh) : show === "fold" ? fold(shot, vh, rects) : spot(shot, rects, used);
    return img && !isBlank(img) ? img : null;
}
// A row whose element lies under something else (the page behind an open cart) is not in the screenshot where its rectangle says.
const rectsOf = (rows) => (rows ?? []).filter((e) => !e.covered).map((e) => e.rect);
const mostlyCovered = (rows) => (rows ?? []).filter((e) => e.covered).length * 2 > (rows ?? []).length;
const classOf = (widths, w) => (widths[w] ? w : Object.keys(widths).find((x) => +x < 500 === +w < 500));

/**
 * Writes the pictures for a run's findings into `dir` and records them on each finding:
 * f.crop (ours) and f.ref = { name, url, file, value, metrics } (the reference, when a like-for-like one exists).
 * refs: { pages: reference pages of this page's type only, dir }.
 * → the page's first screen: { file, boxed: whether any finding is marked in it }, or null.
 */
export function writePictures(page, findings, refs, { dir, shotDir, type }) {
    mkdirSync(dir, { recursive: true });
    const put = (name, img) => { writeFileSync(join(dir, name), encode(img)); return name; };
    const used = {}, shownRefs = new Set(); // per width: the stretches of our page already pictured; the reference pictures already shown
    for (const f of findings) {
        const lesson = LESSONS[f.id], w = f.evidenceWidth, rec = page.widths[w];
        if (!lesson || !rec?.files) continue;
        const usable = lesson.show !== "page" || rec.capture?.full !== false; // a page that paints only what is on screen has no whole-page picture
        // marks that would land on something else are worse than no picture: the finding is then left out of the report
        const mine = usable && !(lesson.show !== "page" && mostlyCovered(f.evidence)) ? picture(lesson.show, load(shotDir, rec.files.full), rec.viewport[1], rectsOf(f.evidence), (used[w] ??= [])) : null;
        if (mine) f.crop = put(`${f.id}-${w}.png`, mine);
        if (lesson.show === "spot") continue;
        // the like-for-like reference: same page type, a usable capture, and the best value on the number that fired
        const lead = f.numbers[0], [, dir0] = FINDINGS[f.id].metrics.find((s) => s.startsWith(`${lead.metric}:`)).split(":");
        const candidates = refs.pages.filter((p) => p.type === type).map((p) => { const k = classOf(p.widths, w); return { p, k, r: p.widths[k], file: p.files?.[k]?.full }; })
            .filter((c) => c.r && c.file && typeof c.r.metrics[lead.metric] === "number" && (lesson.show !== "page" || c.r.capture?.full !== false))
            .sort((a, b) => (dir0 === "high" ? a.r.metrics[lead.metric] - b.r.metrics[lead.metric] : b.r.metrics[lead.metric] - a.r.metrics[lead.metric]))
            .sort((a, b) => shownRefs.has(`${lesson.show} ${a.file}`) - shownRefs.has(`${lesson.show} ${b.file}`)); // a reference picture this page has already shown comes last
        for (const c of candidates) {
            const marks = lesson.show === "cards" ? rectsOf(c.r.evidence?.["content.cardsPerScreen"]).slice(0, 4) : lesson.show === "fold" ? rectsOf(c.r.evidence?.[lead.metric]) : [];
            const theirs = picture(lesson.show === "cards" ? "spot" : lesson.show, load(refs.dir, c.file), c.r.viewport?.[1] ?? 900, marks);
            if (!theirs) continue;
            shownRefs.add(`${lesson.show} ${c.file}`);
            f.ref = { name: c.p.name, url: c.p.url, type: c.p.type, value: c.r.metrics[lead.metric], metrics: c.r.metrics, file: put(`${f.id}-${w}-ref.png`, theirs) };
            break;
        }
    }
    // the page's own first screen, with its largest findings boxed
    const widest = Math.max(...Object.keys(page.widths).map(Number)), rec = page.widths[widest], shot = rec?.files ? load(shotDir, rec.files.full) : null;
    if (!shot) return null;
    const first = fold(shot, rec.viewport[1], findings.slice(0, 5).filter((f) => f.evidenceWidth === widest).flatMap((f) => rectsOf(f.evidence).slice(0, 2)));
    return isBlank(first) ? null : { file: put(`first-screen-${widest}.png`, first), boxed: first.boxed };
}
