/*
 * Screenshot pixel classification, run in a blank page: `await window.__pixels(dataUrl, imageRects)`.
 * imageRects: [x, y, w, h] in screenshot px (from measure.js) — pixels inside are "photography".
 * Outside the mask each pixel is "neutral" when HSV saturation < SAT_T or value < VAL_T, else "accent".
 */
(function () {
    const SAT_T = 0.2;
    const VAL_T = 0.25;
    const BLANK_ROW_SHARE = 0.97; // row is blank when >=97% of its pixels fall in its most common colour bin
    const MIN_BAND = 8; // px; a run of blank rows at least this tall is a whitespace band

    async function pixels(dataUrl, imageRects, coverRects = []) {
        const img = new Image();
        await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = dataUrl; });
        const W = img.naturalWidth, H = img.naturalHeight;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const mask = new Uint8Array(W * H);
        for (const [x, y, w, h] of imageRects) {
            for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) mask.fill(1, yy * W + Math.max(0, x), yy * W + Math.min(W, x + w));
        }
        for (const [x, y, w, h] of coverRects) {
            for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) mask.fill(0, yy * W + Math.max(0, x), yy * W + Math.min(W, x + w));
        }
        let neutral = 0, accent = 0, photo = 0;
        const hueBins = new Array(12).fill(0);
        const accentColours = new Map();
        const blankRows = new Uint8Array(H);
        const CHUNK = 512;
        for (let y0 = 0; y0 < H; y0 += CHUNK) {
            const hh = Math.min(CHUNK, H - y0);
            const d = ctx.getImageData(0, y0, W, hh).data;
            for (let yy = 0; yy < hh; yy++) {
                const rowBins = new Map();
                for (let x = 0; x < W; x++) {
                    const i = (yy * W + x) * 4;
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                    rowBins.set(q, (rowBins.get(q) ?? 0) + 1);
                    if (mask[(y0 + yy) * W + x]) { photo++; continue; }
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
                    const cq = "#" + [r, g, b].map((n) => ((n >> 3) << 3).toString(16).padStart(2, "0")).join("");
                    accentColours.set(cq, (accentColours.get(cq) ?? 0) + 1);
                }
                let top = 0;
                for (const n of rowBins.values()) if (n > top) top = n;
                blankRows[y0 + yy] = top / W >= BLANK_ROW_SHARE ? 1 : 0;
            }
        }
        const total = W * H;
        const bands = [];
        let run = 0, start = 0;
        for (let y = 0; y <= H; y++) {
            if (y < H && blankRows[y]) { if (!run) start = y; run++; }
            else { if (run >= MIN_BAND) bands.push({ y: start, h: run, edge: start === 0 || start + run === H }); run = 0; }
        }
        const inner = bands.filter((b) => !b.edge).map((b) => b.h);
        const r3 = (n) => Math.round(n * 1000) / 1000;
        const sorted = [...inner].sort((a, b) => a - b);
        return {
            size: [W, H],
            colour: {
                neutralShare: r3(neutral / total),
                accentShare: r3(accent / total),
                photoShare: r3(photo / total),
                accentShareOfNonPhoto: r3(accent / Math.max(1, neutral + accent)),
                accentHueBins30deg: hueBins.map((n) => r3(n / total)),
                topAccentColours: [...accentColours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => ({ colour: c, share: r3(n / total) })),
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
    window.__pixels = pixels;
})();
