// Screenshot pixel classification: colour shares, blank bands, and the backdrop behind text
// that sits on a photo or gradient. Images are { w, h, data: RGBA } with one px per CSS px.
// imageRects: [x, y, w, h] where pixels are photography; coverRects: opaque surfaces over them.
const SAT_T = 0.2, VAL_T = 0.25;
const BLANK_ROW_SHARE = 0.97; // a row is blank when this share of it falls in its commonest colour bin
const MIN_BAND = 8; // px of consecutive blank rows that make a whitespace band
const r3 = (n) => Math.round(n * 1000) / 1000;

export function analyse(img, imageRects, coverRects = []) {
    const { w: W, h: H, data: d } = img;
    const mask = new Uint8Array(W * H);
    const fill = (rects, v) => { for (const [x, y, w, h] of rects) for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) { const a = yy * W + Math.max(0, x), b = yy * W + Math.min(W, x + w); if (b > a) mask.fill(v, a, b); } };
    fill(imageRects, 1);
    fill(coverRects, 0);
    let neutral = 0, accent = 0, photo = 0;
    const hueBins = new Array(12).fill(0);
    const accentColours = new Uint32Array(32768);
    const paintBins = new Uint32Array(4096); // 4 bits a channel, non-photo pixels only
    const rowBins = new Uint16Array(4096);
    const blankRows = new Uint8Array(H);
    for (let y = 0; y < H; y++) {
        rowBins.fill(0);
        let top = 0;
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
            const n = ++rowBins[q];
            if (n > top) top = n;
            if (mask[y * W + x]) { photo++; continue; }
            paintBins[q]++;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const v = max / 255, s = max ? (max - min) / max : 0;
            if (s < SAT_T || v < VAL_T) { neutral++; continue; }
            accent++;
            let h;
            if (max === r) h = ((g - b) / (max - min)) % 6;
            else if (max === g) h = (b - r) / (max - min) + 2;
            else h = (r - g) / (max - min) + 4;
            h = (h * 60 + 360) % 360;
            hueBins[Math.floor(h / 30)]++;
            accentColours[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]++;
        }
        blankRows[y] = top / W >= BLANK_ROW_SHARE ? 1 : 0;
    }
    const total = W * H;
    const bands = [];
    let run = 0, start = 0;
    for (let y = 0; y <= H; y++) {
        if (y < H && blankRows[y]) { if (!run) start = y; run++; }
        else { if (run >= MIN_BAND) bands.push({ y: start, h: run, edge: start === 0 || start + run === H }); run = 0; }
    }
    const inner = bands.filter((b) => !b.edge).map((b) => b.h);
    const sorted = [...inner].sort((a, b) => a - b);
    const tops = [...accentColours.entries()].filter(([, n]) => n).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5)
        .map(([q, n]) => ({ colour: "#" + [(q >> 10) << 3, ((q >> 5) & 31) << 3, (q & 31) << 3].map((v) => v.toString(16).padStart(2, "0")).join(""), share: r3(n / total) }));
    const painted = neutral + accent;
    return {
        size: [W, H],
        colour: {
            neutralShare: r3(neutral / total),
            accentShare: r3(accent / total),
            photoShare: r3(photo / total),
            accentShareOfNonPhoto: r3(accent / Math.max(1, painted)),
            accentHueBins30deg: hueBins.map((n) => r3(n / total)),
            topAccentColours: tops,
            hueCount: hueBins.filter((n) => n / total >= 0.004).length,
            colourCount: [...paintBins].filter((n) => n / Math.max(1, painted) >= 0.0025).length,
        },
        whitespace: {
            blankRowShare: r3(blankRows.reduce((a, b) => a + b, 0) / H),
            innerBandCount: inner.length,
            innerBandsPx: inner,
            distinctInnerBandsPx8: [...new Set(inner.map((h) => Math.round(h / 8) * 8))].sort((a, b) => a - b),
            medianInnerBandPx: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
            maxInnerBandPx: sorted.at(-1) ?? null,
        },
    };
}

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/**
 * WCAG contrast of text against what the screenshot shows behind it. A flat backdrop is read
 * exactly (its commonest colour); a photo is read at the 30th percentile towards the text
 * colour, so a caption that only works on the dark half of a picture fails.
 */
export function textContrast(img, job) {
    const [x0, y0, w, h] = job.rect;
    const [fr, fg, fb, fa] = job.fg;
    const lums = [];
    const bins = new Map();
    for (let y = Math.max(0, y0); y < Math.min(img.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(img.w, x0 + w); x++) {
        const i = (y * img.w + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        if (Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(b - fb) <= 90) continue; // glyph pixels
        const q = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        bins.set(q, (bins.get(q) ?? 0) + 1);
        lums.push(lum(r, g, b));
    }
    if (lums.length < 8) return null;
    const fgL = lum(fr, fg, fb);
    let mode = 0, modeQ = 0;
    for (const [q, n] of bins) if (n > mode || (n === mode && q < modeQ)) { mode = n; modeQ = q; }
    let bgL;
    if (mode / lums.length >= 0.5) bgL = lum(((modeQ >> 10) << 3) + 4, (((modeQ >> 5) & 31) << 3) + 4, ((modeQ & 31) << 3) + 4);
    else { lums.sort((a, b) => a - b); const mid = lums[lums.length >> 1]; bgL = lums[Math.floor(lums.length * (fgL > mid ? 0.7 : 0.3))]; }
    const textL = fa * fgL + (1 - fa) * bgL;
    return (Math.max(textL, bgL) + 0.05) / (Math.min(textL, bgL) + 0.05);
}
