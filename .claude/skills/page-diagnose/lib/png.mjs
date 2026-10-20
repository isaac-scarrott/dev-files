// A small PNG codec (8-bit, non-interlaced: what Chrome's screenshots are), so pixel work and
// crops need no browser canvas and no dependency. Images are { w, h, data: RGBA Uint8Array }.
import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }

export function decode(buf) {
    if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
    let w = 0, h = 0, depth = 0, colour = 0, interlace = 0, palette = null, trns = null;
    const idat = [];
    for (let o = 8; o < buf.length; ) {
        const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8), body = buf.subarray(o + 8, o + 8 + len);
        if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; colour = body[9]; interlace = body[12]; }
        else if (type === "PLTE") palette = body;
        else if (type === "tRNS") trns = body;
        else if (type === "IDAT") idat.push(body);
        else if (type === "IEND") break;
        o += 12 + len;
    }
    if (depth !== 8 || interlace) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
    const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour];
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
            let v = line[i];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            cur[i] = v;
        }
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4, i = x * ch;
            if (colour === 6) { data[o] = cur[i]; data[o + 1] = cur[i + 1]; data[o + 2] = cur[i + 2]; data[o + 3] = cur[i + 3]; }
            else if (colour === 2) { data[o] = cur[i]; data[o + 1] = cur[i + 1]; data[o + 2] = cur[i + 2]; data[o + 3] = 255; }
            else if (colour === 3) { const p = cur[i] * 3; data[o] = palette[p]; data[o + 1] = palette[p + 1]; data[o + 2] = palette[p + 2]; data[o + 3] = trns && cur[i] < trns.length ? trns[cur[i]] : 255; }
            else { data[o] = data[o + 1] = data[o + 2] = cur[i]; data[o + 3] = colour === 4 ? cur[i + 1] : 255; }
        }
        prev.set(cur);
    }
    return { w, h, data };
}

function chunk(type, body) {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
}
/** RGB PNG (alpha dropped). */
export function encode(img) {
    const { w, h, data } = img;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
        let o = y * (w * 3 + 1) + 1;
        for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; raw[o++] = data[i]; raw[o++] = data[i + 1]; raw[o++] = data[i + 2]; }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

export function crop(img, x, y, w, h) {
    x = Math.max(0, Math.min(img.w - 1, Math.round(x))); y = Math.max(0, Math.min(img.h - 1, Math.round(y)));
    w = Math.max(1, Math.min(img.w - x, Math.round(w))); h = Math.max(1, Math.min(img.h - y, Math.round(h)));
    const data = new Uint8Array(w * h * 4);
    for (let r = 0; r < h; r++) data.set(img.data.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4), r * w * 4);
    return { w, h, data };
}

/** Box-filter downscale by an integer factor. */
export function shrink(img, k) {
    if (k <= 1) return img;
    const w = Math.floor(img.w / k), h = Math.floor(img.h / k);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = ((y * k + dy) * img.w + x * k + dx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; }
        const o = (y * w + x) * 4, n = k * k;
        data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
    }
    return { w, h, data };
}

/** Outline of `t` px in place. */
export function outline(img, x, y, w, h, rgb = [229, 36, 59], t = 2) {
    const put = (px, py) => { if (px < 0 || py < 0 || px >= img.w || py >= img.h) return; const i = (py * img.w + px) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255; };
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let k = 0; k < t; k++) {
        for (let px = x; px < x + w; px++) { put(px, y + k); put(px, y + h - 1 - k); }
        for (let py = y; py < y + h; py++) { put(x + k, py); put(x + w - 1 - k, py); }
    }
}
