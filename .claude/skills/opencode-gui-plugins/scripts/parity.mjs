#!/usr/bin/env node
// Parity check: diffs plugin UI against its nearest native sibling in a running OpenCode window (CDP, as
// desktop-harness.sh starts it) on three layers, and exits 1 on any FAIL.
//
//   style      computed properties and boxes of the element and its parts, per state (rest, row, hover, focus, active)
//   motion     transition/animation declarations, getAnimations(), and per-frame samples of a property while a
//              state change plays, normalised to the first changed frame; a filmstrip PNG; reduced-motion re-run
//   behaviour  scripted checks run on both sides and compared: event contracts (what mousedown/click/dblclick/
//              auxclick/dragstart/contextmenu reach the document and whether they are defaultPrevented), ARIA and
//              focus attributes, keys, menus, tooltips, and free scenarios (steps then a probe)
//
// usage: node parity.mjs --spec <file.mjs|.json> [--mode style,motion,behaviour] [--only a,b] [--cdp url] [--out dir]
//        node parity.mjs --ours '<selector>' --native '<selector>' [--states rest,row,hover] [--row sel]   (style only)
//   --only <a,b>         element names from the spec to run (the others are skipped, not reported)
//   --cdp <url>          CDP url (default http://127.0.0.1:9333, or $OC_HARNESS_CDP_PORT)
//   --viewport WxH       set before measuring (default 1600x1000; the harness window opens about 2000x1190)
//   --out <dir>          report.json, report.md and per-element artefacts (default /private/tmp/oc-parity/<spec name>)
//   --tolerance <px>     size tolerance (default 0.5)
//   --prepare <js>       page.evaluate'd once before measuring, e.g. to open a menu
// playwright-core is resolved from $OC_PW_ROOT, then the cwd, then /private/tmp/pw (`npm i playwright-core` there).
//
// Spec file: default export (or JSON) of
//   { name, viewport?, prepare?, elements: [{
//       name, ours, native,                // selectors; or { selector, index } for the nth match
//       na?: "reason",                     // the whole element is reported N/A (nothing native to measure)
//       row?,                              // ancestor (closest, self included) that is "the row" for the row state
//       parts?: { title: "[data-slot=tab-title]", ... },   // sub-selectors measured with the element
//       focusTarget?,                      // sub-selector that takes focus in the focus state (default: the element)
//       allow?: { "row.inset-end": "why" }, // checks reported N/A with that reason instead of FAIL
//       prepare?, cleanup?, persistent?,   // JS run before/after this element (open a menu); persistent keeps it
//                                          // open across states (no Escape) and re-runs prepare if it vanished
//       style?: { states?: [...], props?: [...], partProps?: [...], tolerance? },
//       motion?: [{ name, target?, from?, to, props?, duration?, tolerance?, filmstrip? }],
//       behaviour?: [{ name, check, target?, only?: "ours"|"native", expect?, after?, ignore?, ...options }
//                    | { name, na: "reason" }],
//   }] }
// checks: event-contract, aria, tab-order, hover-reveal, focus-visible, keys, menu, tooltip, scenario (steps + probe).
// `only` runs a check on one side and compares it with `expect` (a contract the other side cannot share); `after`
// is JS run once the check is done (restore what a click changed); `ignore` (menu) is a selector for items another
// plugin injects. Every element gets style unless `style: false`; motion and behaviour only when listed. A check
// marked `na` or `allow`ed is reported N/A with its reason and never passes silently without one.
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { deflateSync, inflateSync } from "node:zlib"

const PROPS = ["width", "height", "padding", "margin", "border-radius", "color", "background-color", "background-image", "opacity", "visibility", "font-size", "font-weight", "line-height", "box-shadow", "outline", "cursor", "transition", "user-select"]
const PART_PROPS = ["width", "height", "color", "background-color", "opacity", "font-size", "font-weight", "line-height", "border-radius", "display", "overflow", "text-overflow", "mask-image"]
const ICON_PROPS = ["width", "height", "color", "opacity"]
const ROW = "[data-titlebar-tab], [data-tab-key], [data-component=menu-v2-item], [data-slot=session-header]"
const STATES = ["rest", "row", "hover", "focus", "active"]
const MOTION_PROPS = ["opacity", "transform", "background-color", "color", "width", "height", "grid-template-rows"]
const MOTION_DECL = ["transition-property", "transition-duration", "transition-timing-function", "transition-delay", "animation-name", "animation-duration", "animation-timing-function", "animation-iteration-count"]
const EVENTS = ["pointerdown", "mousedown", "click", "dblclick", "auxclick", "dragstart", "contextmenu"]
const ARIA = ["role", "aria-label", "aria-haspopup", "aria-expanded", "aria-pressed", "aria-disabled", "tabindex", "draggable", "contenteditable", "dir", "href"]

const args = parse(process.argv.slice(2))
const spec = args.spec ? await loadSpec(args.spec) : quickSpec(args)
if (!spec) {
  console.error("usage: parity.mjs --spec <file> [--mode style,motion,behaviour] [--only name] | --ours <sel> --native <sel> [--states ...] [--row sel]")
  process.exit(2)
}
const modes = (args.mode ?? "style,motion,behaviour").split(",")
const cdp = args.cdp ?? `http://127.0.0.1:${process.env.OC_HARNESS_CDP_PORT ?? 9333}`
const out = args.out ?? join("/private/tmp/oc-parity", spec.name)
const tolerance = Number(args.tolerance ?? 0.5)
const [vw, vh] = (args.viewport ?? spec.viewport ?? "1600x1000").split("x").map(Number)


// --- style ------------------------------------------------------------------------------------------------------------

async function styleLayer(element, result, dir) {
  const cfg = element.style ?? {}
  const states = cfg.states ?? ["rest", "row", "hover"]
  const props = cfg.props ?? PROPS
  const partProps = cfg.partProps ?? PART_PROPS
  const tol = cfg.tolerance ?? tolerance
  const shots = {}
  for (const state of states) {
    const a = await measure(element, element.ours, state, props, partProps)
    const b = await measure(element, element.native, state, props, partProps)
    const rows = compare(state, a, b, tol)
    for (const r of rows) {
      r.layer = "style"
      r.name = `${state}.${r.name}`
      result.style.push(r)
      record(r)
    }
    if (state === "hover" || state === states.at(-1)) {
      shots.ours = await crop(element, element.ours, state)
      shots.native = await crop(element, element.native, state)
    }
  }
  if (shots.ours && shots.native) writeFileSync(join(dir, "side-by-side.png"), sideBySide(shots.ours, shots.native))
  writeFileSync(join(dir, "style.json"), JSON.stringify(result.style, null, 2))
}

async function settle(element, target, state) {
  // Leave every previous state: park the pointer in the window's top-left (the drag region), drop focus and buttons.
  // A `persistent` element (an open menu or popover) keeps focus and never sees Escape, which would close it.
  // The pointer leaves before the button is released, or an `active` press on a live close button becomes a click.
  await page.mouse.move(2, 2)
  await page.mouse.up().catch(() => {})
  if (!element.persistent) {
    await page.keyboard.press("Escape").catch(() => {})
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
  }
  // A persistent element that a previous state dismissed (focusing one menu closes the other) is opened again.
  if (element.prepare && !(await page.evaluate((t) => !!q(t), target))) {
    if (element.cleanup) await page.evaluate(element.cleanup)
    await page.evaluate(element.prepare)
    await page.waitForTimeout(400)
  }
  const rowSel = element.row ?? ROW
  if (state === "row") {
    // Hover the row's own box but away from the element: its left edge, vertically centred.
    const box = await page.evaluate(([t, r]) => {
      const el = q(t)
      const row = el.closest(r) ?? el
      const b = row.getBoundingClientRect()
      return { x: b.x + Math.min(10, b.width / 4), y: b.y + b.height / 2 }
    }, [target, rowSel])
    await page.mouse.move(box.x, box.y)
  }
  if (state === "hover" || state === "active") {
    const c = await centre(target)
    await page.mouse.move(c.x, c.y)
    if (state === "active") await page.mouse.down()
  }
  if (state === "focus") {
    // A keyboard event first, so :focus-visible applies as it does for a Tab press.
    await page.keyboard.press("Shift")
    await page.evaluate(([t, sub]) => qIn(q(t), sub)?.focus({ preventScroll: true }), [target, element.focusTarget ?? null])
  }
  await page.waitForTimeout(250) // longer than the host's 150ms opacity transition
}

async function centre(target) {
  return page.evaluate((t) => {
    const b = q(t).getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }, target)
}

async function measure(element, target, state, props, partProps) {
  await settle(element, target, state)
  return page.evaluate(([t, r, parts, props, partProps, iconProps]) => {
    const el = q(t)
    if (!el) return null
    const cs = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    const row = el.closest(r)
    const rb = row?.getBoundingClientRect()
    const icon = el.querySelector("svg")
    const ics = icon && getComputedStyle(icon)
    const read = (node, list) => Object.fromEntries(list.map((p) => [p, getComputedStyle(node).getPropertyValue(p)]))
    const partData = {}
    for (const [name, sub] of Object.entries(parts ?? {})) {
      const node = el.querySelector(sub)
      if (!node) { partData[name] = null; continue }
      const pb = node.getBoundingClientRect()
      partData[name] = { style: read(node, partProps), box: { width: pb.width, height: pb.height, dx: pb.x - box.x, dy: pb.y - box.y } }
    }
    return {
      tag: el.tagName.toLowerCase(),
      attrs: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-") || a.name === "class").map((a) => [a.name, a.value])),
      style: Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])),
      box: { width: box.width, height: box.height, x: box.x, y: box.y },
      row: rb ? { dy: box.y + box.height / 2 - (rb.y + rb.height / 2), end: rb.right - box.right, height: rb.height } : null,
      icon: ics ? Object.fromEntries(iconProps.map((p) => [p, ics.getPropertyValue(p)])) : null,
      parts: partData,
    }
  }, [target, element.row ?? ROW, element.parts ?? null, props, partProps, ICON_PROPS])
}

function compare(state, a, b, tol) {
  const rows = []
  const check = (name, x, y, numeric = false) => {
    const pass = numeric ? Math.abs(Number(x) - Number(y)) <= tol : x === y
    rows.push({ name, ours: x, native: y, verdict: pass ? "PASS" : "FAIL" })
  }
  for (const p of Object.keys(a.style)) check(p, a.style[p], b.style[p])
  check("box.width", a.box.width.toFixed(2), b.box.width.toFixed(2), true)
  check("box.height", a.box.height.toFixed(2), b.box.height.toFixed(2), true)
  if (a.row && b.row) check("row.centre-dy", a.row.dy.toFixed(2), b.row.dy.toFixed(2), true)
  if (a.row && b.row) check("row.height", a.row.height.toFixed(2), b.row.height.toFixed(2), true)
  if (a.row && b.row) check("row.inset-end", a.row.end.toFixed(2), b.row.end.toFixed(2), true)
  if (a.icon && b.icon) for (const p of Object.keys(a.icon)) check(`icon.${p}`, a.icon[p], b.icon[p])
  else if (a.icon || b.icon) check("icon", a.icon ? "svg" : "none", b.icon ? "svg" : "none")
  for (const name of Object.keys(a.parts)) {
    const x = a.parts[name], y = b.parts[name]
    if (!x || !y) { check(`${name}`, x ? "present" : "missing", y ? "present" : "missing"); continue }
    for (const p of Object.keys(x.style)) check(`${name}.${p}`, x.style[p], y.style[p])
    for (const k of ["width", "height", "dx", "dy"]) check(`${name}.${k}`, x.box[k].toFixed(2), y.box[k].toFixed(2), true)
  }
  const info = a.row && b.row ? ` (row ${a.row.height}px vs ${b.row.height}px, inset from row end ours ${a.row.end.toFixed(1)} native ${b.row.end.toFixed(1)})` : ""
  console.log(`\n== style · ${state}${info}`)
  return rows
}

async function crop(element, target, state) {
  await settle(element, target, state)
  // The row around the element, so the screenshot shows the element in context; the element itself otherwise.
  const clip = await page.evaluate(([t, r]) => {
    const el = q(t)
    const b = (el.closest(r) ?? el).getBoundingClientRect()
    return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: b.width + 8, height: b.height + 8 }
  }, [target, element.row ?? ROW])
  return decodePng(await page.screenshot({ clip }))
}

// --- motion -----------------------------------------------------------------------------------------------------------

// A motion entry plays the `from` → `to` state change (states as above, or "open"/"close" via the element's
// `open`/`close` page scripts) and samples `props` of `target` (a sub-selector, default the element) each frame.
async function motionLayer(element, m, result, dir) {
  const props = m.props ?? MOTION_PROPS
  const duration = m.duration ?? 400
  const tol = m.tolerance ?? 0.06
  const sides = {}
  for (const side of ["ours", "native"]) {
    const decl = await declarations(element, element[side], m)
    const samples = await sample(element, element[side], m, props, duration)
    sides[side] = { decl, samples: normalise(samples) }
  }
  const push = (name, ours, native, pass, note) => {
    const r = { layer: "motion", name: `${m.name}.${name}`, ours, native, verdict: pass ? "PASS" : "FAIL", note }
    result.motion.push(r)
    record(r)
  }
  console.log(`\n== motion · ${m.name}`)
  for (const p of MOTION_DECL) push(`decl.${p}`, sides.ours.decl.style[p], sides.native.decl.style[p], sides.ours.decl.style[p] === sides.native.decl.style[p])
  push("animations", JSON.stringify(sides.ours.decl.animations), JSON.stringify(sides.native.decl.animations), JSON.stringify(sides.ours.decl.animations) === JSON.stringify(sides.native.decl.animations))
  const a = sides.ours.samples, b = sides.native.samples
  push("changed-props", a.changed.join(","), b.changed.join(","), a.changed.join(",") === b.changed.join(","))
  push("settle-ms", a.settle, b.settle, Math.abs(a.settle - b.settle) <= Math.max(34, duration * 0.15), "within one frame or 15%")
  for (const p of a.changed) {
    if (!b.changed.includes(p)) continue
    const worst = worstDelta(a.frames, b.frames, p)
    push(`curve.${p}`, `${worst.ours} @${worst.t}ms`, `${worst.native} @${worst.t}ms`, worst.delta <= tol, `max |Δ| ${worst.delta.toFixed(3)} over ${a.frames.length} frames, tol ${tol}`)
  }
  // Reduced motion: the same change with the media query on; both sides should settle the same way.
  await page.emulateMedia({ reducedMotion: "reduce" })
  const ra = normalise(await sample(element, element.ours, m, props, duration))
  const rb = normalise(await sample(element, element.native, m, props, duration))
  await page.emulateMedia({ reducedMotion: null })
  push("reduced-motion.settle-ms", ra.settle, rb.settle, Math.abs(ra.settle - rb.settle) <= Math.max(34, duration * 0.15))
  push("reduced-motion.changed-props", ra.changed.join(","), rb.changed.join(","), ra.changed.join(",") === rb.changed.join(","))
  if (m.filmstrip !== false) {
    const times = m.frames ?? [0, 40, 80, 120, 200, 320]
    const strip = { ours: [], native: [] }
    for (const side of ["ours", "native"]) for (const t of times) strip[side].push(await frameAt(element, element[side], m, t))
    writeFileSync(join(dir, `filmstrip-${m.name}.png`), filmstrip(strip.ours, strip.native, times))
  }
  writeFileSync(join(dir, `motion-${m.name}.json`), JSON.stringify(sides, null, 2))
}

async function declarations(element, target, m) {
  await settle(element, target, m.from ?? "rest")
  return page.evaluate(([t, sub, decl]) => {
    const el = qIn(q(t), sub)
    const cs = getComputedStyle(el)
    return {
      style: Object.fromEntries(decl.map((p) => [p, cs.getPropertyValue(p)])),
      animations: el.getAnimations({ subtree: true }).map((a) => ({ type: a.constructor.name, name: a.animationName ?? a.transitionProperty, duration: a.effect?.getTiming().duration, easing: a.effect?.getTiming().easing, iterations: a.effect?.getTiming().iterations })),
    }
  }, [target, m.target ?? null, MOTION_DECL])
}

async function enter(element, target, m, state) {
  if (state === "open" || state === "close") {
    await page.evaluate(([t, js]) => new Function("el", js)(q(t)), [target, element[state]])
    return
  }
  await settle(element, target, state)
}

async function sample(element, target, m, props, duration) {
  await enter(element, target, m, m.from ?? "rest")
  const sampling = page.evaluate(([t, sub, props, duration]) => new Promise((resolve) => {
    const el = qIn(q(t), sub)
    const frames = []
    const t0 = performance.now()
    const tick = () => {
      const cs = getComputedStyle(el)
      frames.push({ t: performance.now() - t0, v: Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])) })
      if (performance.now() - t0 < duration) requestAnimationFrame(tick)
      else resolve(frames)
    }
    requestAnimationFrame(tick)
  }), [target, m.target ?? null, props, duration])
  await page.waitForTimeout(20)
  await trigger(element, target, m, m.to)
  return sampling
}

async function trigger(element, target, m, state) {
  if (state === "open" || state === "close") return page.evaluate(([t, js]) => new Function("el", js)(q(t)), [target, element[state]])
  const rowSel = element.row ?? ROW
  if (state === "row") {
    const box = await page.evaluate(([t, r]) => { const el = q(t); const b = (el.closest(r) ?? el).getBoundingClientRect(); return { x: b.x + Math.min(10, b.width / 4), y: b.y + b.height / 2 } }, [target, rowSel])
    return page.mouse.move(box.x, box.y)
  }
  if (state === "hover") { const c = await centre(target); return page.mouse.move(c.x, c.y) }
  if (state === "active") { const c = await centre(target); await page.mouse.move(c.x, c.y); return page.mouse.down() }
  if (state === "focus") { await page.keyboard.press("Shift"); return page.evaluate((t) => q(t)?.focus({ preventScroll: true }), target) }
  if (state === "rest") return page.mouse.move(2, 2)
}

// Frames before the first change are dropped and time restarts at that change, so sampling jitter does not count.
function normalise(frames) {
  if (!frames.length) return { frames: [], changed: [], settle: 0 }
  const first = frames[0].v
  const changed = Object.keys(first).filter((p) => frames.some((f) => f.v[p] !== first[p]))
  const start = frames.findIndex((f) => changed.some((p) => f.v[p] !== first[p]))
  if (start < 0) return { frames: [], changed, settle: 0 }
  const t0 = frames[start].t
  const last = frames.at(-1).v
  let settleIndex = frames.length - 1
  while (settleIndex > start && changed.every((p) => frames[settleIndex - 1].v[p] === last[p])) settleIndex--
  return { frames: frames.slice(start).map((f) => ({ t: Math.round(f.t - t0), v: f.v })), changed, settle: Math.round(frames[settleIndex].t - t0) }
}

function worstDelta(a, b, prop) {
  let worst = { delta: 0, t: 0, ours: "", native: "" }
  for (const f of a) {
    const g = b.reduce((best, x) => (Math.abs(x.t - f.t) < Math.abs(best.t - f.t) ? x : best), b[0])
    if (!g || Math.abs(g.t - f.t) > 20) continue
    const delta = numericDelta(f.v[prop], g.v[prop])
    if (delta > worst.delta) worst = { delta, t: f.t, ours: f.v[prop], native: g.v[prop] }
  }
  return worst
}

// Compares numbers inside two computed values (opacity, matrix(), rgb()), normalised by the largest magnitude seen.
function numericDelta(x, y) {
  const nx = (x.match(/-?\d*\.?\d+/g) ?? []).map(Number), ny = (y.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  if (nx.length !== ny.length) return 1
  const scale = Math.max(1, ...nx.map(Math.abs), ...ny.map(Math.abs))
  return Math.max(0, ...nx.map((v, i) => Math.abs(v - ny[i]) / scale))
}

async function frameAt(element, target, m, t) {
  await enter(element, target, m, m.from ?? "rest")
  await trigger(element, target, m, m.to)
  await page.waitForTimeout(t)
  const clip = await page.evaluate(([t, r]) => {
    const el = q(t)
    const b = (el.closest(r) ?? el).getBoundingClientRect()
    return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: b.width + 8, height: b.height + 8 }
  }, [target, element.row ?? ROW])
  return decodePng(await page.screenshot({ clip }))
}

// --- behaviour --------------------------------------------------------------------------------------------------------

async function behaviourLayer(element, b, result) {
  const push = (name, ours, native, pass, note) => {
    const r = { layer: "behaviour", name: `${b.name}.${name}`, ours, native, verdict: pass ? "PASS" : "FAIL", note }
    result.behaviour.push(r)
    record(r)
  }
  console.log(`\n== behaviour · ${b.name}`)
  if (b.na) {
    const r = { layer: "behaviour", name: b.name, ours: "", native: "", verdict: "N/A", note: b.na }
    result.behaviour.push(r)
    record(r)
    return
  }
  const run = CHECKS[b.check]
  if (!run) throw new Error(`unknown behaviour check "${b.check}" (${Object.keys(CHECKS).join(", ")})`)
  // `only: "ours" | "native"` runs the check on one side alone against `expect`, for a contract the other side cannot
  // show (the native X in a row whose action replaces it; a native row that also carries a demo action).
  const sides = { ours: {}, native: {} }
  const run_sides = b.only ? [b.only] : ["ours", "native"]
  for (const side of run_sides) {
    await settle(element, element[side], "rest")
    sides[side] = await run(element, element[side], b)
  }
  // A check's `after` script undoes what the check did to the window (a navigation the native side performed).
  if (b.after) { await page.evaluate(b.after); await page.waitForTimeout(300) }
  const keys = new Set([...Object.keys(sides.ours), ...Object.keys(sides.native)])
  for (const k of keys) {
    const x = JSON.stringify(sides.ours[k]), y = JSON.stringify(sides.native[k])
    const expect = b.expect?.[k]
    const matches = (side, v) => !run_sides.includes(side) || v === JSON.stringify(expect)
    const pass = expect !== undefined ? matches("ours", x) && matches("native", y) : x === y
    push(k, run_sides.includes("ours") ? x : "", run_sides.includes("native") ? y : "", pass, expect !== undefined ? `expected ${JSON.stringify(expect)}` : undefined)
  }
}

const CHECKS = {
  // Which of the pointer events the element lets through to the document, and which it defaultPrevents.
  "event-contract": (element, target, b) => page.evaluate(([t, sub, events, mods]) => {
    const el = qIn(q(t), sub)
    const out = {}
    for (const type of events) {
      const seen = { reachedDocument: false, defaultPrevented: false }
      const listener = () => (seen.reachedDocument = true)
      document.addEventListener(type, listener)
      const init = { bubbles: true, cancelable: true, composed: true, ...(mods?.[type] ?? {}) }
      const event = type === "dragstart" ? new DragEvent(type, init) : type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init)
      el.dispatchEvent(event)
      seen.defaultPrevented = event.defaultPrevented
      document.removeEventListener(type, listener)
      out[type] = seen
    }
    return out
  }, [target, b.target ?? null, b.events ?? EVENTS, b.init ?? null]),

  // ARIA and focus attributes, plus the computed cursor over the element.
  aria: async (element, target, b) => {
    const c = await centre(target)
    await page.mouse.move(c.x, c.y)
    await page.waitForTimeout(50)
    // Attributes whose value is an id or a url (href, aria-controls) compare as set/empty/null.
    return page.evaluate(([t, sub, names]) => {
      const el = qIn(q(t), sub)
      const attrs = Object.fromEntries(names.map((n) => [n, el.getAttribute(n)]))
      for (const n of ["href", "aria-controls", "id"]) if (n in attrs && attrs[n] !== null) attrs[n] = attrs[n] ? "set" : "empty"
      return { ...attrs, tag: el.tagName.toLowerCase(), cursor: getComputedStyle(el).cursor, focusable: el.tabIndex >= 0 }
    }, [target, b.target ?? null, b.attrs ?? ARIA])
  },

  // The tab stops inside the row, in DOM order, as Tab would visit them.
  "tab-order": (element, target, b) => page.evaluate(([t, r]) => {
    const el = q(t)
    const row = el.closest(r) ?? el
    const stops = [...row.querySelectorAll("a[href], button, [tabindex]")].filter((n) => n.tabIndex >= 0 && !n.hasAttribute("disabled"))
    return { stops: stops.map((n) => `${n.tagName.toLowerCase()}${n.getAttribute("data-slot") ? `[${n.getAttribute("data-slot")}]` : ""}:${n.tabIndex}`) }
  }, [target, element.row ?? ROW]),

  // Opacity of a sub-element at rest, with the row hovered, and with the element itself hovered.
  "hover-reveal": async (element, target, b) => {
    const read = () => page.evaluate(([t, sub]) => getComputedStyle(qIn(q(t), sub)).opacity, [target, b.target ?? null])
    await settle(element, target, "rest")
    const rest = await read()
    await settle(element, target, "row")
    const row = await read()
    await settle(element, target, "hover")
    const hover = await read()
    return { rest, row, hover }
  },

  // After a keyboard focus: outline, box-shadow, background and opacity of the focused element.
  "focus-visible": async (element, target, b) => {
    await settle(element, target, "rest")
    await page.keyboard.press("Shift")
    await page.evaluate(([t, sub]) => qIn(q(t), sub)?.focus({ preventScroll: true }), [target, b.target ?? null])
    await page.waitForTimeout(100)
    return page.evaluate(([t, sub]) => {
      const el = qIn(q(t), sub)
      const cs = getComputedStyle(el)
      return { focused: document.activeElement === el, visible: el.matches(":focus-visible"), outline: cs.outline, boxShadow: cs.boxShadow, background: cs.backgroundColor, opacity: cs.opacity }
    }, [target, b.target ?? null])
  },

  // Dispatches keys on the element (or its focused sub-element) and records where focus lands and what was prevented.
  keys: async (element, target, b) => {
    const out = {}
    for (const key of b.keys) {
      await settle(element, target, "rest")
      await page.evaluate(([t, sub]) => qIn(q(t), sub)?.focus({ preventScroll: true }), [target, b.target ?? null])
      const before = await page.evaluate(() => (window.__parityKey = { prevented: null }, document.addEventListener("keydown", (e) => (window.__parityKey.prevented = e.defaultPrevented), { once: true }), true))
      await page.keyboard.press(key)
      await page.waitForTimeout(80)
      out[key] = await page.evaluate(([t, r]) => {
        const el = q(t)
        const row = el?.closest(r) ?? el
        const active = document.activeElement
        const where = !active || active === document.body ? "body" : row?.contains(active) ? `row:${active.tagName.toLowerCase()}${active.getAttribute("data-slot") ? `[${active.getAttribute("data-slot")}]` : ""}` : active.closest("[role=menu]") ? "menu" : "elsewhere"
        return { focus: where, prevented: window.__parityKey.prevented, rowPresent: !!el?.isConnected, popupOpen: !!document.querySelector("[role=menu][data-component=menu-v2-content], [role=dialog][data-expanded]") }
      }, [target, element.row ?? ROW])
      await page.keyboard.press("Escape")
    }
    return out
  },

  // Right-click: does a menu open, what shape are its items, does ArrowDown highlight, does Escape close and
  // where does focus go. Item texts differ by design; their count and variants are compared when `items` is set.
  menu: async (element, target, b) => {
    await settle(element, target, "rest")
    const c = await centre(target)
    await page.mouse.click(c.x, c.y, { button: "right" })
    await page.waitForTimeout(250)
    // `ignore` is a selector for items another plugin injects into whichever menu it sees; they are left out of the shape.
    const opened = await page.evaluate((ignore) => {
      const menu = document.querySelector("[role=menu][data-component=menu-v2-content]")
      if (!menu) return { open: false }
      const items = [...menu.querySelectorAll("[role=menuitem]")].filter((i) => !ignore || !i.matches(ignore))
      return {
        open: true,
        appearance: menu.getAttribute("data-appearance"),
        itemShape: items.map((i) => `${i.getAttribute("data-component")}${i.dataset.variant ? `[${i.dataset.variant}]` : ""}${i.getAttribute("aria-haspopup") ? "[sub]" : ""}${i.getAttribute("aria-disabled") === "true" ? "[disabled]" : ""}`),
        separators: [...menu.querySelectorAll("[data-slot=menu-v2-separator]")].filter((i) => !ignore || !i.matches(ignore)).length,
        texts: items.map((i) => i.querySelector("[data-slot=menu-v2-item-content]")?.textContent?.trim() ?? i.textContent.trim()),
        focusInMenu: !!document.activeElement?.closest("[role=menu]"),
      }
    }, b.ignore ?? null)
    if (!opened.open) return opened
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(50)
    const afterDown = await page.evaluate(() => {
      const menu = document.querySelector("[role=menu][data-component=menu-v2-content]")
      const hi = [...menu.querySelectorAll("[data-highlighted]")]
      return { highlighted: hi.length, focusedIsHighlighted: hi.includes(document.activeElement) }
    })
    await page.keyboard.press("End")
    await page.waitForTimeout(50)
    const afterEnd = await page.evaluate(() => {
      const menu = document.querySelector("[role=menu][data-component=menu-v2-content]")
      const items = [...menu.querySelectorAll("[role=menuitem]:not([aria-disabled=true])")]
      return { lastHighlighted: items.at(-1)?.hasAttribute("data-highlighted") ?? false }
    })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(150)
    const afterEscape = await page.evaluate(([t, r]) => {
      const el = q(t)
      const row = el?.closest(r) ?? el
      const active = document.activeElement
      return { closed: !document.querySelector("[role=menu][data-component=menu-v2-content]"), focus: !active || active === document.body ? "body" : row?.contains(active) ? "row" : "elsewhere" }
    }, [target, element.row ?? ROW])
    const { texts, ...shape } = opened
    return { ...(b.items ? shape : { open: true, appearance: shape.appearance, focusInMenu: shape.focusInMenu }), ...(b.texts ? { texts } : {}), arrowDown: afterDown, end: afterEnd, escape: afterEscape }
  },

  // Tooltip presence at two delays after hover, and its placement side relative to the element.
  tooltip: async (element, target, b) => {
    await settle(element, target, "rest")
    const c = await centre(target)
    await page.mouse.move(c.x, c.y)
    const probe = () => page.evaluate((t) => {
      const tip = document.querySelector("[data-component=tooltip-v2-content]")
      if (!tip) return "none"
      const a = q(t).getBoundingClientRect(), p = tip.getBoundingClientRect()
      return p.top >= a.bottom - 1 ? "bottom" : p.bottom <= a.top + 1 ? "top" : p.left >= a.right - 1 ? "right" : "left"
    }, target)
    await page.waitForTimeout(b.early ?? 150)
    const early = await probe()
    await page.waitForTimeout(b.late ?? 900)
    const late = await probe()
    return { early, late }
  },

  // Free scenario: steps (hover | mousedown | mouseup | click | dblclick | middle | right | key:<Key> | wait:<ms> |
  // js:<code>) on the element (or a step's `target` sub-selector), then a probe evaluated with `el`.
  scenario: async (element, target, b) => {
    await settle(element, target, "rest")
    for (const raw of b.steps) {
      const step = typeof raw === "string" ? { do: raw } : raw
      const sub = step.target ?? null
      const c = await page.evaluate(([t, sub]) => { const b = qIn(q(t), sub).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, [target, sub])
      const [verb, arg] = step.do.split(/:(.*)/s)
      if (verb === "hover") await page.mouse.move(c.x, c.y)
      else if (verb === "mousedown") { await page.mouse.move(c.x, c.y); await page.mouse.down() }
      else if (verb === "mouseup") await page.mouse.up()
      else if (verb === "click") await page.mouse.click(c.x, c.y)
      else if (verb === "dblclick") await page.mouse.dblclick(c.x, c.y)
      else if (verb === "middle") await page.mouse.click(c.x, c.y, { button: "middle" })
      else if (verb === "right") await page.mouse.click(c.x, c.y, { button: "right" })
      else if (verb === "key") await page.keyboard.press(arg)
      else if (verb === "wait") await page.waitForTimeout(Number(arg))
      else if (verb === "js") await page.evaluate(([t, sub, js]) => new Function("el", js)(qIn(q(t), sub)), [target, sub, arg])
      else throw new Error(`unknown step ${step.do}`)
      await page.waitForTimeout(step.settle ?? 60)
    }
    const value = await page.evaluate(([t, js]) => new Function("el", js)(q(t)), [target, b.probe])
    if (b.after) await page.evaluate(([t, js]) => new Function("el", js)(q(t)), [target, b.after])
    return { result: value }
  },
}

// --- reporting ---------------------------------------------------------------------------------------------------------

let current
// A difference the spec allows by design (`allow: { "row.inset-end": "sits one button inward" }`) is reported N/A
// with that reason; the key matches the check name with its state or entry prefix stripped.
function record(r) {
  if (r.verdict === "FAIL" && current?.allow) {
    const key = Object.keys(current.allow).find((k) => r.name === k || r.name.endsWith(`.${k}`))
    if (key) { r.verdict = "N/A"; r.note = `allowed: ${current.allow[key]}` }
  }
  if (r.verdict === "PASS") report.pass++
  else if (r.verdict === "FAIL") report.fail++
  else report.na++
  const body = r.verdict === "N/A" ? r.note : r.verdict === "PASS" ? `${cell(r.native)}${r.note ? `  (${r.note})` : ""}` : `ours=${cell(r.ours)}  native=${cell(r.native)}${r.note ? `  (${r.note})` : ""}`
  console.log(`${r.verdict.padEnd(4)} ${r.name.padEnd(34)} ${body}`)
}

function cell(v) { return v === undefined || v === null ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160) }
function describe(t) { return typeof t === "string" ? t : `${t.selector} [${t.index ?? 0}]` }

// --- png (no dependencies) ---------------------------------------------------------------------------------------

function decodePng(buf) {
  let pos = 8
  let w = 0, h = 0, bpp = 4
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      // Chromium screenshots are 8-bit RGB (2) or RGBA (6).
      if (data[8] !== 8 || (data[9] !== 6 && data[9] !== 2)) throw new Error(`expected 8-bit RGB/RGBA png, got depth ${data[8]} type ${data[9]}`)
      bpp = data[9] === 6 ? 4 : 3
    } else if (type === "IDAT") idat.push(data)
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const outLine = px.subarray(y * stride, (y + 1) * stride)
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? outLine[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      outLine[i] = v & 255
    }
  }
  if (bpp === 4) return { w, h, px }
  const rgba = Buffer.alloc(w * h * 4, 255)
  for (let i = 0; i < w * h; i++) px.copy(rgba, i * 4, i * 3, i * 3 + 3)
  return { w, h, px: rgba }
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

/** Images laid out on a grid: `rows` is an array of arrays of decoded PNGs; `gutter` px between cells. */
function grid(rows, gutter = 8) {
  const cw = Math.max(...rows.flat().map((i) => i.w)), ch = Math.max(...rows.flat().map((i) => i.h))
  const cols = Math.max(...rows.map((r) => r.length))
  const w = cols * cw + (cols - 1) * gutter, h = rows.length * ch + (rows.length - 1) * gutter
  const px = Buffer.alloc(w * h * 4)
  rows.forEach((row, ry) => row.forEach((img, cx) => {
    const ox = cx * (cw + gutter), oy = ry * (ch + gutter)
    for (let y = 0; y < img.h; y++) img.px.copy(px, ((oy + y) * w + ox) * 4, y * img.w * 4, (y + 1) * img.w * 4)
  }))
  return encodePng({ w, h, px })
}

/** Ours on the left, native on the right. */
const sideBySide = (a, b) => grid([[a, b]])
/** Ours on the top row, native below, one column per sampled time. */
const filmstrip = (a, b) => grid([a, b], 6)

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

function quickSpec(a) {
  if (!a.ours || !a.native) return null
  return { name: "quick", elements: [{ name: "element", ours: a.ours, native: a.native, row: a.row, style: { states: (a.states ?? "rest,row,hover").split(",") } }] }
}

async function loadSpec(file) {
  const path = resolve(file)
  if (path.endsWith(".json")) return JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(path, "utf8")))
  const mod = await import(pathToFileURL(path).href)
  const spec = mod.default ?? mod
  spec.name ??= basename(path).replace(/\.[^.]+$/, "")
  return spec
}

async function loadPlaywright() {
  const roots = [process.env.OC_PW_ROOT, process.cwd(), "/private/tmp/pw"].filter(Boolean)
  for (const root of roots) {
    try { return createRequire(join(root, "noop.js"))("playwright-core") } catch {}
  }
  throw new Error(`playwright-core not found in ${roots.join(", ")}; mkdir /private/tmp/pw && (cd /private/tmp/pw && npm i playwright-core)`)
}

// --- run (after every declaration above, so the helpers are initialised) ---------------------------------------

const { chromium } = await loadPlaywright()
const browser = await chromium.connectOverCDP(cdp)
const page = browser.contexts()[0].pages()[0]
await page.setViewportSize({ width: vw, height: vh })
const prepare = args.prepare ?? spec.prepare
if (prepare) await page.evaluate(prepare)
await page.waitForTimeout(300)

// `q` resolves a selector or { selector, index } in the page; installed once per run.
await page.evaluate(() => {
  window.q = (t) => {
    if (!t) return null
    if (typeof t === "string") return document.querySelector(t)
    return document.querySelectorAll(t.selector)[t.index ?? 0] ?? null
  }
  window.qIn = (root, sub) => (sub ? root.querySelector(sub) : root)
})

mkdirSync(out, { recursive: true })
const report = { spec: spec.name, cdp, modes, elements: [], pass: 0, fail: 0, na: 0 }
const lines = [`# parity: ${spec.name}`, ""]
for (const element of spec.elements) {
  if (args.only && !args.only.split(",").includes(element.name)) continue
  const result = { name: element.name, ours: element.ours, native: element.native, style: [], motion: [], behaviour: [] }
  report.elements.push(result)
  const dir = join(out, element.name)
  mkdirSync(dir, { recursive: true })
  console.log(`\n#### ${element.name}\n   ours   ${describe(element.ours)}\n   native ${describe(element.native)}`)
  lines.push(`## ${element.name}`, "", `ours \`${describe(element.ours)}\`, native \`${describe(element.native)}\``, "")
  if (element.na) {
    const row = { layer: "style", name: "element", ours: "", native: "", verdict: "N/A", note: element.na }
    result.style.push(row)
    record(row)
    continue
  }
  // Element-level `prepare`/`cleanup` scripts open and close what the comparison needs (a menu, a popover). Cleanup
  // runs first so a leftover (a menu the previous element left open) is not toggled closed; a miss is prepared once more.
  const isPresent = () => page.evaluate((e) => [!!q(e.ours), !!q(e.native)], { ours: element.ours, native: element.native })
  let present = [false, false]
  for (let attempt = 0; attempt < 2 && (!present[0] || !present[1]); attempt++) {
    if (element.prepare) {
      if (element.cleanup) { await page.evaluate(element.cleanup); await page.waitForTimeout(200) }
      await page.evaluate(element.prepare)
      await page.waitForTimeout(400)
    }
    present = await isPresent()
    if (!element.prepare) break
  }
  if (!present[0] || !present[1]) {
    const row = { layer: "style", name: "present", ours: present[0], native: present[1], verdict: "FAIL", note: `${present[0] ? "native" : "ours"} selector matched nothing` }
    result.style.push(row)
    record(row)
    if (element.cleanup) await page.evaluate(element.cleanup)
    continue
  }
  current = element
  if (modes.includes("style") && element.style !== false) await styleLayer(element, result, dir)
  if (modes.includes("motion")) for (const m of element.motion ?? []) await motionLayer(element, m, result, dir)
  if (modes.includes("behaviour")) for (const b of element.behaviour ?? []) await behaviourLayer(element, b, result)
  if (element.cleanup) { await page.evaluate(element.cleanup); await page.waitForTimeout(200) }
  for (const layer of ["style", "motion", "behaviour"]) {
    if (!result[layer].length) continue
    lines.push(`### ${layer}`, "", "| check | verdict | ours | native |", "|---|---|---|---|")
    for (const r of result[layer]) lines.push(`| ${r.name} | ${r.verdict}${r.note ? ` (${r.note})` : ""} | ${cell(r.ours)} | ${cell(r.native)} |`)
    lines.push("")
  }
}

writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2))
writeFileSync(join(out, "report.md"), lines.join("\n"))
console.log(`\n${report.fail ? "FAIL" : "PASS"} ${report.pass} pass · ${report.fail} fail · ${report.na} n/a · ${out}/report.md`)
await page.emulateMedia({ reducedMotion: null }).catch(() => {})
await browser.close()
process.exit(report.fail ? 1 : 0)
