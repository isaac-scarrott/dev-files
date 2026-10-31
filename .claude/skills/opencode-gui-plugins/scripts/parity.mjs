#!/usr/bin/env node
// Parity check: diffs a plugin element against its nearest native sibling in a running OpenCode window (CDP, as
// desktop-harness.sh starts it). Prints PASS/FAIL per computed property and state, writes a side-by-side screenshot
// and a JSON report, exits 1 on any FAIL.
//
// usage: node parity.mjs --ours '<selector>' --native '<selector>' [options]
//   --cdp <url>          CDP url (default http://127.0.0.1:9333, or $OC_HARNESS_CDP_PORT)
//   --states a,b,c       rest | row (hover the row the element sits in) | hover | focus   (default rest,row,hover)
//   --row <selector>     ancestor that counts as the row for `row` and for the row-centre metric
//                        (default: [data-titlebar-tab], [data-component=menu-v2-item], [data-slot=session-header])
//   --viewport WxH       set before measuring (default 1600x1000; the harness window opens about 2000x1190)
//   --out <dir>          where parity.png / parity.json go (default /private/tmp/oc-parity)
//   --tolerance <px>     size tolerance (default 0.5)
//   --prepare <js>       page.evaluate'd once before measuring, e.g. to open a menu
// playwright-core is resolved from $OC_PW_ROOT, then the cwd, then /private/tmp/pw (`npm i playwright-core` there).
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync, inflateSync } from "node:zlib"

const PROPS = ["width", "height", "padding", "margin", "border-radius", "color", "background-color", "opacity", "font-size", "font-weight", "line-height", "box-shadow", "cursor", "transition"]
const ICON_PROPS = ["width", "height", "color", "opacity"]
const ROW = "[data-titlebar-tab], [data-component=menu-v2-item], [data-slot=session-header]"

const args = parse(process.argv.slice(2))
if (!args.ours || !args.native) {
  console.error("usage: parity.mjs --ours <selector> --native <selector> [--cdp url] [--states rest,row,hover,focus] [--row sel] [--out dir]")
  process.exit(2)
}
const cdp = args.cdp ?? `http://127.0.0.1:${process.env.OC_HARNESS_CDP_PORT ?? 9333}`
const states = (args.states ?? "rest,row,hover").split(",")
const out = args.out ?? "/private/tmp/oc-parity"
const tolerance = Number(args.tolerance ?? 0.5)
const rowSel = args.row ?? ROW
const [vw, vh] = (args.viewport ?? "1600x1000").split("x").map(Number)

const { chromium } = await loadPlaywright()
const browser = await chromium.connectOverCDP(cdp)
const page = browser.contexts()[0].pages()[0]
await page.setViewportSize({ width: vw, height: vh })
if (args.prepare) await page.evaluate(args.prepare)
await page.waitForTimeout(300)

const report = { cdp, ours: args.ours, native: args.native, states: {}, fails: 0 }
const shots = {}
for (const state of states) {
  const a = await measure(args.ours, state)
  const b = await measure(args.native, state)
  if (!a || !b) {
    console.log(`${state}: ${!a ? "ours" : "native"} selector matched nothing`)
    report.fails++
    continue
  }
  report.states[state] = compare(state, a, b)
  if (state === (states.includes("hover") ? "hover" : states.at(-1))) shots.ours = await crop(args.ours, state, a), shots.native = await crop(args.native, state, b)
}

mkdirSync(out, { recursive: true })
if (shots.ours && shots.native) writeFileSync(join(out, "parity.png"), sideBySide(shots.ours, shots.native))
writeFileSync(join(out, "parity.json"), JSON.stringify(report, null, 2))
console.log(`\n${report.fails ? "FAIL" : "PASS"} ${report.fails} failing · ${join(out, "parity.png")} · ${join(out, "parity.json")}`)
await browser.close()
process.exit(report.fails ? 1 : 0)

// --- measurement -------------------------------------------------------------------------------------------------

async function settle(selector, state) {
  // Leave every previous state: park the pointer in the window's top-left (the drag region) and drop focus.
  await page.mouse.move(2, 2)
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
  if (state === "row") {
    const row = await page.evaluate(([s, r]) => !!document.querySelector(s)?.closest(r), [selector, rowSel])
    if (!row) throw new Error(`no row ancestor (${rowSel}) for ${selector}`)
    // Hover the row's own box but away from the element: its left edge, vertically centred.
    const box = await page.evaluate(([s, r]) => { const b = document.querySelector(s).closest(r).getBoundingClientRect(); return { x: b.x + 10, y: b.y + b.height / 2 } }, [selector, rowSel])
    await page.mouse.move(box.x, box.y)
  }
  if (state === "hover") {
    await page.locator(selector).first().hover({ force: true })
  }
  if (state === "focus") {
    // A keyboard event first, so :focus-visible applies as it does for a Tab press.
    await page.keyboard.press("Shift")
    await page.evaluate((s) => document.querySelector(s)?.focus({ preventScroll: true }), selector)
  }
  await page.waitForTimeout(250) // longer than the host's 150ms opacity transition
}

async function measure(selector, state) {
  await settle(selector, state)
  return page.evaluate(([s, r, props, iconProps]) => {
    const el = document.querySelector(s)
    if (!el) return null
    const cs = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    const row = el.closest(r)
    const rb = row?.getBoundingClientRect()
    const icon = el.querySelector("svg")
    const ics = icon && getComputedStyle(icon)
    return {
      tag: el.tagName.toLowerCase(),
      attrs: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-") || a.name === "class").map((a) => [a.name, a.value])),
      style: Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])),
      box: { width: box.width, height: box.height, x: box.x, y: box.y },
      row: rb ? { dy: box.y + box.height / 2 - (rb.y + rb.height / 2), end: rb.right - box.right, height: rb.height } : null,
      icon: ics ? Object.fromEntries(iconProps.map((p) => [p, ics.getPropertyValue(p)])) : null,
    }
  }, [selector, rowSel, PROPS, ICON_PROPS])
}

function compare(state, a, b) {
  const rows = []
  const check = (name, x, y, numeric = false) => {
    const pass = numeric ? Math.abs(Number(x) - Number(y)) <= tolerance : x === y
    rows.push({ name, ours: x, native: y, pass })
    if (!pass) report.fails++
  }
  for (const p of PROPS) check(p, a.style[p], b.style[p])
  check("box.width", a.box.width.toFixed(2), b.box.width.toFixed(2), true)
  check("box.height", a.box.height.toFixed(2), b.box.height.toFixed(2), true)
  if (a.row && b.row) check("row.centre-dy", a.row.dy.toFixed(2), b.row.dy.toFixed(2), true)
  if (a.icon && b.icon) for (const p of ICON_PROPS) check(`icon.${p}`, a.icon[p], b.icon[p])
  else if (a.icon || b.icon) check("icon", a.icon ? "svg" : "none", b.icon ? "svg" : "none")
  const info = a.row && b.row ? ` (inset from row end: ours ${a.row.end.toFixed(1)}px, native ${b.row.end.toFixed(1)}px)` : ""
  console.log(`\n== ${state}${info}\n   ours   <${a.tag} ${Object.entries(a.attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}>\n   native <${b.tag} ${Object.entries(b.attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}>`)
  for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name.padEnd(18)} ${r.pass ? r.native : `ours=${r.ours}  native=${r.native}`}`)
  return rows
}

async function crop(selector, state, m) {
  await settle(selector, state)
  // The row around the element, so the screenshot shows the element in context; the element itself otherwise.
  const clip = await page.evaluate(([s, r]) => {
    const el = document.querySelector(s)
    const b = (el.closest(r) ?? el).getBoundingClientRect()
    return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: b.width + 8, height: b.height + 8 }
  }, [selector, rowSel])
  return decodePng(await page.screenshot({ clip }))
}

// --- png (no dependencies) ---------------------------------------------------------------------------------------

function decodePng(buf) {
  let pos = 8
  let w = 0, h = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6) throw new Error("expected 8-bit RGBA png")
    } else if (type === "IDAT") idat.push(data)
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const outLine = px.subarray(y * stride, (y + 1) * stride)
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? outLine[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      outLine[i] = v & 255
    }
  }
  return { w, h, px }
}

function encodePng({ w, h, px }) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride) }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }

/** Ours on the left, native on the right, an 8px gutter, padded to the taller one with transparent pixels. */
function sideBySide(a, b) {
  const gutter = 8
  const w = a.w + gutter + b.w, h = Math.max(a.h, b.h)
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    if (y < a.h) a.px.copy(px, y * w * 4, y * a.w * 4, (y + 1) * a.w * 4)
    if (y < b.h) b.px.copy(px, (y * w + a.w + gutter) * 4, y * b.w * 4, (y + 1) * b.w * 4)
  }
  return encodePng({ w, h, px })
}

// --- misc ----------------------------------------------------------------------------------------------------------

function parse(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith("--")) continue
    o[k.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true
  }
  return o
}

async function loadPlaywright() {
  const roots = [process.env.OC_PW_ROOT, process.cwd(), "/private/tmp/pw"].filter(Boolean)
  for (const root of roots) {
    try { return createRequire(join(root, "noop.js"))("playwright-core") } catch {}
  }
  throw new Error(`playwright-core not found in ${roots.join(", ")}; mkdir /private/tmp/pw && (cd /private/tmp/pw && npm i playwright-core)`)
}
