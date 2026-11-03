import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HeartbeatIcon } from "./icons.js"
import { HEARTBEAT_ANIMATIONS, HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_LIVE_PLACEHOLDER, HEARTBEAT_LOOP, HEARTBEAT_POINTS, HEARTBEAT_RUN, HEARTBEAT_TRACE, heartbeatChipCss, heartbeatDotKeyframes, heartbeatGoneKeyframes, heartbeatIconCss, syncHeartbeats } from "./heartbeat.js"
import { laneChipCss } from "./lane-chip-rows.js"

const stops = (css: string) => [...css.matchAll(/(\d+(?:\.\d+)?)%(?:, 100%)? \{([^}]*)\}/g)].map((m) => ({ percent: Number(m[1]), body: m[2]!.trim() }))
const translateOf = (body: string) => {
  const m = body.match(/transform: translate\((-?[\d.]+)px, (-?[\d.]+)px\)/)
  return m ? ([Number(m[1]) + 1.5, Number(m[2]) + 1.5] as const) : null
}

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

test("a row is the trace plus a dot and two trailing dots, which only a live icon shows", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => <HeartbeatIcon state="still" />, host)
  assert.equal(host.querySelectorAll('[data-icon="heartbeat"] > b').length, 1)
  assert.deepEqual([...host.querySelectorAll('[data-icon="heartbeat"] > i')].map((i) => (i as HTMLElement).dataset.dot), ["head", "near", "far"])
  dispose()
  assert.match(heartbeatIconCss, /\[data-icon="heartbeat"\] > i \{ left: 0; top: 0; display: none;/)
  assert.match(heartbeatIconCss, /\[data-state="live"\] > i \{ display: block; transition: none; \}/)
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

test("the dot's keyframes put a translate on every vertex of the trace, each at the time its segment ends", () => {
  const found = stops(heartbeatDotKeyframes)
  const total = HEARTBEAT_RUN.reduce((sum, [ms]) => sum + ms, 0)
  assert.equal(HEARTBEAT_RUN.length, HEARTBEAT_POINTS.length - 1)
  let elapsed = 0
  HEARTBEAT_POINTS.forEach((point, index) => {
    const stop = found.find((s) => Math.abs(s.percent - (elapsed / (HEARTBEAT_LOOP * 1000)) * 100) < 0.01 && translateOf(s.body))
    assert.ok(stop, `vertex ${index} has a translate stop`)
    const [x, y] = translateOf(stop!.body)!
    assert.ok(Math.abs(x - point[0]) < 0.011 && Math.abs(y - point[1]) < 0.011, `vertex ${index}: ${x},${y} is ${point}`)
    elapsed += HEARTBEAT_RUN[index]?.[0] ?? 0
  })
  assert.ok(total < HEARTBEAT_LOOP * 1000 * 0.5, "the run is over by half the loop, the rest is rest")
})

test("the dot moves quickly through the QRS and slowly along the flats, and ends on an ease-out", () => {
  const speed = (index: number) => {
    const [x0, y0] = HEARTBEAT_POINTS[index]!
    const [x1, y1] = HEARTBEAT_POINTS[index + 1]!
    return Math.hypot(x1 - x0, y1 - y0) / HEARTBEAT_RUN[index]![0]
  }
  const flats = HEARTBEAT_POINTS.flatMap((p, i) => (i + 1 < HEARTBEAT_POINTS.length && p[1] === 8 && HEARTBEAT_POINTS[i + 1]![1] === 8 ? [i] : []))
  const spike = HEARTBEAT_POINTS.findIndex(([, y]) => y === Math.min(...HEARTBEAT_POINTS.map((p) => p[1])))
  assert.ok(flats.length >= 3)
  for (const flat of flats) assert.ok(speed(spike) > speed(flat) * 8, `R is 8 times as fast as flat ${flat}`)
  assert.match(HEARTBEAT_RUN[HEARTBEAT_RUN.length - 1]![1], /^cubic-bezier\(0\.23, 1, 0\.32, 1\)$/)
  assert.ok(HEARTBEAT_RUN.slice(0, -1).every(([, ease]) => ease === "linear"), "constant speed within a stretch, so the path is followed exactly")
})

test("compositor only: the keyframes animate transform and opacity and nothing else, no timer, no mask, no clip-path", () => {
  const props = new Set([...(heartbeatDotKeyframes + heartbeatGoneKeyframes).matchAll(/([a-z-]+):/g)].map((m) => m[1]))
  for (const prop of ["transform", "opacity", "animation-timing-function"]) assert.ok(props.has(prop), prop)
  for (const prop of props) assert.ok(["transform", "opacity", "animation-timing-function"].includes(prop!), `unexpected property ${prop}`)
  const named = [...(heartbeatIconCss + heartbeatChipCss).matchAll(/animation: ([a-z-]+) /g)].map((m) => m[1])
  assert.ok(named.length >= 6)
  for (const name of named) assert.ok(name === "heartbeat-dot", name)
})

test("opacity stops never share a time with a translate stop except the start, so each keeps its own easing", () => {
  const found = stops(heartbeatDotKeyframes)
  const opacity = found.filter((s) => /opacity/.test(s.body))
  const moves = found.filter((s) => translateOf(s.body))
  for (const stop of opacity) if (stop.percent > 0 && stop.percent < 100) assert.ok(!moves.some((m) => m.percent === stop.percent), `${stop.percent}%`)
  assert.equal(opacity[0]!.percent, 0)
  assert.match(opacity[0]!.body, /opacity: 0/)
  assert.match(opacity[opacity.length - 1]!.body, /opacity: 0/)
})

test("the dot is the strongest text token, and the trace stays the muted token", () => {
  assert.match(heartbeatIconCss, /i\[data-dot="head"\] \{[^}]*background: var\(--v2-text-text-base\)/)
  assert.match(heartbeatIconCss, /> b \{[^}]*background: var\(--v2-icon-icon-muted\)/)
  assert.doesNotMatch(heartbeatIconCss + heartbeatChipCss, /will-change/)
})

test("the dot is a pixel-aligned 3px box with a border-radius, trailing dots are smaller soft discs in the same box", () => {
  assert.match(heartbeatIconCss, /i\[data-dot="head"\] \{[^}]*width: 3px; height: 3px;[^}]*border-radius: 50%/)
  for (const tail of ["near", "far"]) assert.match(heartbeatIconCss, new RegExp(`i\\[data-dot="${tail}"\\] \\{[^}]*width: 3px; height: 3px;[^}]*radial-gradient`))
  assert.doesNotMatch(heartbeatIconCss, /\bscale: 0\.\d/)
})

test("the chip: the catalog svg is the trace, the capsule's pseudo-elements and the label's are the three dots, in a 16px box centred on the 14px slot", () => {
  assert.match(heartbeatChipCss, /::before, [^{]*::after, [^{]*> span::before[^{]*\{ content: ""; \}/)
  assert.match(heartbeatChipCss, /> svg use\b[^{]*\{ display: none; \}/)
  assert.match(heartbeatChipCss, /> svg\b[^{]*\{ position: absolute; left: 9px; top: calc\(50% - 8px\); width: 16px; height: 16px;[^}]*mask-image/)
  assert.equal(9 + 16 / 2, 10 + 14 / 2, "the glyph centre is the old slot's centre")
  assert.match(heartbeatChipCss, /padding-inline-start: calc\(10px \+ 14px \+ 8px\)/)
  for (const where of ["::before", " > span::before", "::after"]) assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}"\\]\\)${where.replace(">", "\\>")} \\{ display: block; transition: none; animation: heartbeat-dot 2s \\d+ms infinite`))
  assert.ok(laneChipCss.includes(heartbeatChipCss.trim().split("\n")[0]!))
})

test("the trailing dots lag the dot in time, so they follow the same path", () => {
  assert.match(heartbeatIconCss, /data-dot="head"\] \{ animation: heartbeat-dot 2s 0ms infinite/)
  assert.match(heartbeatIconCss, /data-dot="near"\] \{ animation: heartbeat-dot 2s 32ms infinite/)
  assert.match(heartbeatIconCss, /data-dot="far"\] \{ animation: heartbeat-dot 2s 64ms infinite/)
})

test("reduced motion: no animation and no dot under the media query or data-motion=reduce, the flatten is instant", () => {
  assert.match(heartbeatIconCss, /@media \(prefers-reduced-motion: reduce\) \{ \[data-icon="heartbeat"\] > i \{ display: none; animation: none; \}/)
  assert.match(heartbeatIconCss, /:root\[data-motion="reduce"\] \[data-icon="heartbeat"\] > i \{ display: none; animation: none; \}/)
  assert.match(heartbeatIconCss, /:root\[data-motion="reduce"\] \[data-icon="heartbeat"\] > b \{ transition: none; \}/)
  assert.match(heartbeatChipCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*::after[^{]*\{ display: none; animation: none; \}/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*> span::before[^{]*\{ display: none; animation: none; \}/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*> svg \{ transition: none; \}/)
})

test("done: the trace squashes to the baseline over 300ms, the dots flatten onto it with the same curve, fade over 220ms and leave", () => {
  assert.match(heartbeatIconCss, /> b \{[^}]*transition: mask-size 300ms cubic-bezier\(0\.25, 0\.7, 0\.3, 1\)/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > b \{ mask-size: 100% 0%, 100% 100%; \}/)
  assert.match(heartbeatIconCss, /> i \{[^}]*transition: scale 300ms cubic-bezier\(0\.25, 0\.7, 0\.3, 1\), display 0s 260ms allow-discrete/)
  assert.match(heartbeatIconCss, /transform-origin: 0 8px/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > i\[data-dot="head"\] \{ scale: 1 0; animation: heartbeat-dot 2s 0ms infinite, heartbeat-gone 220ms ease-out forwards; animation-composition: replace, add; \}/)
  assert.match(heartbeatGoneKeyframes, /from \{ opacity: 0; \} to \{ opacity: -1; \}/)
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\)(?: >)? svg \\{ mask-size: 100% 0%, 100% 100%; \\}|icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\) > svg \\{ mask-size: 100% 0%, 100% 100%; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\)::before \\{ scale: 1 0; animation: heartbeat-dot`))
})

test("the chip draws the heartbeat only inside our two placeholder pills", () => {
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}`))
})

test("every animation the css names that runs on the loop is one syncHeartbeats pins", () => {
  const named = [...(heartbeatIconCss + heartbeatChipCss).matchAll(/animation: (heartbeat-[a-z-]+) /g)].map((m) => m[1])
  assert.ok(named.length >= 6)
  for (const name of named) assert.ok(HEARTBEAT_ANIMATIONS.includes(name!), name)
})

test("heartbeats are pinned to the timeline origin when one starts, and the listener goes away", () => {
  const beats = [{ animationName: "heartbeat-dot", startTime: 5 as number | null }, { animationName: "other", startTime: 7 as number | null }, { animationName: "heartbeat-gone", startTime: 2 as number | null }, { animationName: "heartbeat-dot", startTime: 2 as number | null }]
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
