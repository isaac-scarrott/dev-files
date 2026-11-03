import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HeartbeatIcon } from "./icons.js"
import { HEARTBEAT_ANIMATIONS, HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_GLINT, HEARTBEAT_LIVE_PLACEHOLDER, HEARTBEAT_LOOP, HEARTBEAT_POINTS, HEARTBEAT_TRACE, heartbeatChipCss, heartbeatGlintKeyframes, heartbeatGoneKeyframes, heartbeatIconCss, syncHeartbeats } from "./heartbeat.js"
import { laneChipCss } from "./lane-chip-rows.js"

const stops = (css: string) => [...css.matchAll(/(\d+(?:\.\d+)?)%(?:, 100%)? \{([^}]*)\}/g)].map((m) => ({ percent: Number(m[1]), body: m[2]!.trim() }))
const ms = (percent: number) => (percent / 100) * HEARTBEAT_LOOP * 1000

test("the icon is a span carrying its state, and a change of state keeps the same node", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const [state, setState] = createSignal<"live" | "still" | "flat">("live")
  const dispose = render(() => <HeartbeatIcon state={state()} />, host)
  const icon = host.querySelector<HTMLElement>('[data-icon="heartbeat"]')!
  assert.equal(icon.dataset.state, "live")
  setState("flat")
  assert.equal(host.querySelector('[data-icon="heartbeat"]'), icon)
  assert.equal(icon.dataset.state, "flat")
  dispose()
})

test("a row is the trace holding the band, and the flat line", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => <HeartbeatIcon state="still" />, host)
  assert.equal(host.querySelectorAll('[data-icon="heartbeat"] > b > i').length, 1)
  assert.equal(host.querySelectorAll('[data-icon="heartbeat"] > u').length, 1)
  assert.equal(host.querySelectorAll('[data-icon="heartbeat"] i').length, 1, "one band, no dot, no tail")
  dispose()
  assert.match(heartbeatIconCss, /\[data-icon="heartbeat"\] > b > i \{[^}]*left: 0; display: none; \}/)
  assert.match(heartbeatIconCss, /\[data-state="live"\] > b > i \{ display: block; animation: heartbeat-glint 2\.4s infinite; \}/)
})

test("the trace is a classic P-QRS-T in the 16px box: baseline at 8, a tall narrow spike, symmetric ink", () => {
  assert.equal(HEARTBEAT_TRACE, `M${HEARTBEAT_POINTS.map(([x, y]) => `${x} ${y}`).join("L")}`)
  const xs = HEARTBEAT_POINTS.map(([x]) => x)
  const ys = HEARTBEAT_POINTS.map(([, y]) => y)
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [1, 15], "the ink spans the box, with the round caps inside it")
  assert.equal(Math.min(...ys) + Math.max(...ys), 16, "ink is centred on the baseline, so the chip's glyph centre is the clock's")
  assert.equal(HEARTBEAT_POINTS[0]![1], 8)
  assert.equal(HEARTBEAT_POINTS[HEARTBEAT_POINTS.length - 1]![1], 8)
  const spike = HEARTBEAT_POINTS.findIndex(([, y]) => y === Math.min(...ys))
  assert.ok(HEARTBEAT_POINTS[spike + 1]![1] === Math.max(...ys) && HEARTBEAT_POINTS[spike + 1]![0] - HEARTBEAT_POINTS[spike]![0] < 1.5, "R then S, narrow")
  const bumps = HEARTBEAT_POINTS.filter(([, y]) => y < 8 && y > 5)
  assert.ok(bumps.length >= 4, "a P and a T bump above the baseline")
})

test("the glint's keyframes: one band crossing the box at constant speed, in over the start and out over the end, then rest", () => {
  const found = stops(heartbeatGlintKeyframes)
  const { width, run, fadeIn, fadeOut } = HEARTBEAT_GLINT
  assert.match(found[0]!.body, new RegExp(`transform: translateX\\(-${width}px\\); opacity: 0; animation-timing-function: linear;`))
  const times = found.map((s) => Math.round(ms(s.percent)))
  assert.deepEqual(times, [0, fadeIn, run - fadeOut, run], "the stops: start, faded in, start fading out, end (which holds to 100%)")
  assert.match(heartbeatGlintKeyframes, /, 100% \{/)
  assert.match(found[1]!.body, /opacity: 1/)
  assert.match(found[2]!.body, /opacity: 1; animation-timing-function: cubic-bezier\(0\.4, 0, 0\.6, 1\)/)
  assert.match(found[3]!.body, /transform: translateX\(16px\); opacity: 0/)
  assert.ok(run < HEARTBEAT_LOOP * 1000 * 0.5, "the glint is over by half the loop, the rest is rest")
  assert.ok(found[1]!.body.includes("linear") && !/transform/.test(found[1]!.body), "transform has no stop between the ends, so it runs at one speed")
})

test("compositor only: the keyframes animate transform and opacity and nothing else, no mask, no clip-path, and no composition add on the loop", () => {
  const props = new Set([...(heartbeatGlintKeyframes + heartbeatGoneKeyframes).matchAll(/([a-z-]+):/g)].map((m) => m[1]))
  for (const prop of ["transform", "opacity", "animation-timing-function"]) assert.ok(props.has(prop), prop)
  for (const prop of props) assert.ok(["transform", "opacity", "animation-timing-function"].includes(prop!), `unexpected property ${prop}`)
  const all = heartbeatIconCss + heartbeatChipCss
  assert.doesNotMatch(all, /will-change|clip-path/)
  for (const [, rule] of all.matchAll(/\{([^{}]*animation-composition[^{}]*)\}/g)) assert.match(rule!, /heartbeat-gone/, "only the ending fade composes")
  assert.doesNotMatch(all, /animation: heartbeat-glint 2\.4s infinite; animation-composition/)
  assert.doesNotMatch(all, /transition: [^;}]*mask-size/)
})

test("the band is a 7px gradient over the base icon token, the trace stays the muted token, nothing else is drawn", () => {
  assert.equal(HEARTBEAT_GLINT.width, 7)
  assert.match(heartbeatIconCss, /> b > i \{[^}]*width: 7px; height: 16px; background: linear-gradient\(90deg, transparent, var\(--v2-icon-icon-base\) 50%, transparent\)/)
  assert.match(heartbeatIconCss, /> b \{[^}]*background: var\(--v2-icon-icon-muted\)/)
  assert.doesNotMatch(heartbeatIconCss + heartbeatChipCss, /box-shadow|border-radius|radial-gradient|data-dot/)
})

test("the chip: the catalog svg is a muted plane, ::before the band, ::after a stencil, the label's ::before the flat line, in a 16px box centred on the 14px slot", () => {
  assert.match(heartbeatChipCss, /::before, [^{]*::after, [^{]*> span::before[^{]*\{ content: ""; \}/)
  assert.match(heartbeatChipCss, /> svg use\b[^{]*\{ display: none; \}/)
  const plane = heartbeatChipCss.match(/> svg \{ position: absolute; left: 9px; top: calc\(50% - 8px\); width: 16px; height: 16px;[^}]*\}/)![0]
  assert.match(plane, /background: var\(--v2-icon-icon-muted\)/)
  assert.doesNotMatch(plane, /mask/, "a mask under the stencil would multiply the stroke's anti-aliased edge by itself and thin it")
  assert.equal(9 + 16 / 2, 10 + 14 / 2, "the glyph centre is the old slot's centre")
  assert.match(heartbeatChipCss, /padding-inline-start: calc\(10px \+ 14px \+ 8px\)/)
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}"\\]\\)::before \\{ display: block; transition: none; animation: heartbeat-glint 2\\.4s infinite; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}"\\]\\)::after \\{ display: block; transition: none; \\}`))
  assert.ok(laneChipCss.includes(heartbeatChipCss.trim().split("\n")[0]!))
})

test("the stencil is the capsule's own background with a trace-shaped hole, as wide as the band's travel, so no light shows outside the stroke and every state matches", () => {
  const rule = heartbeatChipCss.match(/::after \{ position: absolute; z-index: 2;[^}]*\}/)![0]
  assert.match(rule, /background: inherit/)
  assert.match(rule, /left: 2px; top: calc\(50% - 9px\); width: 30px; height: 18px/)
  assert.match(rule, /mask-composite: exclude/)
  assert.match(rule, /mask-position: 0 0, 7px 1px/)
  assert.match(rule, /transform-origin: 0 9px/, "the baseline of the plane, one bleed pixel down")
  assert.equal(2 + 7, 9, "the hole sits on the glyph box")
  assert.equal(1 + 16 + 1, 18, "a pixel taller each side than the plane, so the plane never shows at the edge")
  assert.equal(30, 7 + 16 + 7, "the band starts 7px left of the glyph box and ends 7px right of it")
  assert.equal(2 + 30, 32, "the stencil ends where the label starts")
  assert.match(rule, /pointer-events: none/)
})

test("reduced motion: no animation and no band under the media query or data-motion=reduce, the flatten is instant", () => {
  assert.match(heartbeatIconCss, /@media \(prefers-reduced-motion: reduce\) \{ \[data-icon="heartbeat"\] > b > i \{ display: none; animation: none; \}/)
  assert.match(heartbeatIconCss, /:root\[data-motion="reduce"\] \[data-icon="heartbeat"\] > b > i \{ display: none; animation: none; \}/)
  assert.match(heartbeatIconCss, /:root\[data-motion="reduce"\] \[data-icon="heartbeat"\] > b, :root\[data-motion="reduce"\] \[data-icon="heartbeat"\] > u \{ transition: none; \}/)
  assert.match(heartbeatChipCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*::before[^{]*\{ display: none; animation: none; \}/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*::after[^{]*\{ display: none; animation: none; \}/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*> svg[^{]*\{ transition: none; \}/)
})

test("where the stencil cannot work the svg becomes the masked trace and the layers go: reduced motion and no mask-composite", () => {
  assert.match(heartbeatChipCss, /@supports not \(mask-composite: exclude\) \{[^}]*icon-outline-wave-audio"\]\) > svg \{ mask-repeat: no-repeat;[^}]*mask-image: url/)
  assert.match(heartbeatChipCss, /@media \(prefers-reduced-motion: reduce\) \{[^}]*icon-outline-wave-audio"\]\) > svg \{[^}]*mask-image: url/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\] \[data-slot="session-plugin-pill"\]:has\(use\[href\$="icon-outline-wave-audio"\]\) > svg \{[^}]*mask-image: url/)
})

test("done: the trace squashes to the baseline over 300ms by scale, the flat line fades in, the glint fades over 220ms and everything leaves", () => {
  assert.match(heartbeatIconCss, /> b \{[^}]*transform-origin: 0 8px; transition: scale 300ms cubic-bezier\(0\.25, 0\.7, 0\.3, 1\), display 0s 320ms allow-discrete/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > b \{ scale: 1 0; display: none; \}/)
  assert.match(heartbeatIconCss, /> u \{[^}]*opacity: 0; transition: opacity 300ms cubic-bezier\(0\.25, 0\.7, 0\.3, 1\)/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > u \{ opacity: 1; \}/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > b > i \{ display: block; animation: heartbeat-glint 2\.4s infinite, heartbeat-gone 220ms ease-out forwards; animation-composition: replace, add; \}/)
  assert.match(heartbeatGoneKeyframes, /from \{ opacity: 0; \} to \{ opacity: -1; \}/)
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\)(?: >)? svg \\{ scale: 1 0; display: none; \\}|icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\) > svg \\{ scale: 1 0; display: none; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\)::before \\{ scale: 1 0; animation: heartbeat-glint 2\\.4s infinite, heartbeat-gone 220ms ease-out forwards; animation-composition: replace, add; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\)::after \\{ scale: 1 0; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\) > span::before \\{ opacity: 1; \\}`))
})

test("the chip draws the heartbeat only inside our two placeholder pills", () => {
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}`))
})

test("every animation the css names that runs on the loop is one syncHeartbeats pins", () => {
  const named = [...(heartbeatIconCss + heartbeatChipCss).matchAll(/animation: (heartbeat-[a-z-]+) /g)].map((m) => m[1])
  assert.ok(named.length >= 4)
  for (const name of named) assert.ok(HEARTBEAT_ANIMATIONS.includes(name!), name)
})

test("heartbeats are pinned to the timeline origin when one starts, and the listener goes away", () => {
  const beats = [{ animationName: "heartbeat-glint", startTime: 5 as number | null }, { animationName: "other", startTime: 7 as number | null }, { animationName: "heartbeat-gone", startTime: 2 as number | null }, { animationName: "heartbeat-glint", startTime: 2 as number | null }]
  const listeners = new Set<() => void>()
  const doc = {
    getAnimations: () => beats,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  } as unknown as Document
  const stop = syncHeartbeats(doc)
  assert.equal(beats[0]!.startTime, 0)
  assert.equal(beats[1]!.startTime, 7)
  assert.equal(beats[2]!.startTime, 2, "the fade-out is not on the loop")
  assert.equal(beats[3]!.startTime, 0)
  beats[0]!.startTime = 3
  ;[...listeners].forEach((fn) => fn())
  assert.equal(beats[0]!.startTime, 0)
  stop()
  assert.equal(listeners.size, 0)
})
