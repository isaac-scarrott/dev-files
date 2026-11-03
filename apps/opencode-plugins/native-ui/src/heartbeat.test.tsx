import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HeartbeatIcon } from "./icons.js"
import { HEARTBEAT_ANIMATIONS, HEARTBEAT_BAND, HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_LIVE_PLACEHOLDER, HEARTBEAT_LOOP, HEARTBEAT_SWEEP, HEARTBEAT_TRACE, heartbeatChipCss, heartbeatIconCss, heartbeatMasks, heartbeatSweepKeyframes, syncHeartbeats } from "./heartbeat.js"
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
  assert.equal(host.querySelectorAll('[data-icon="heartbeat"] i').length, 1, "one band, no dot")
  dispose()
  assert.match(heartbeatIconCss, /\[data-icon="heartbeat"\] > b > i \{[^}]*left: 0; display: none; \}/)
  assert.match(heartbeatIconCss, /\[data-state="live"\] > b > i \{ display: block; animation: heartbeat-sweep 2\.4s infinite; \}/)
})

test("the trace is the simple one: flat, one up spike, one down spike, a small return, flat; centred on the baseline, 13px of ink or more", () => {
  assert.equal(HEARTBEAT_TRACE, "M1.5 8H4.5L6 4L8 12L9.75 6.5L10.75 8H14.5")
  assert.doesNotMatch(HEARTBEAT_TRACE, /[CQS]/)
  assert.equal(4 + 12, 2 * 8, "the spikes are as far above the baseline as below it, so the chip glyph's centre is the clock's")
  assert.ok(14.5 - 1.5 >= 13, "no shorter than the first version's 13px")
  assert.match(heartbeatMasks.trace, /stroke-width%3D'0\.9'/)
  assert.match(heartbeatMasks.trace, /stroke-linecap%3D'round'/)
})

test("the sweep: the head enters at the stroke's left end, is slowest on the first flat, quickest through the spikes, relaxes to the end and leaves fading, then rests", () => {
  const [enter, start, spikes, back, end, out] = HEARTBEAT_SWEEP
  assert.equal(enter.opacity, 0)
  assert.equal(start.x, 1.5, "the stroke starts at x=1.5")
  assert.equal(end.x, 14.5, "and ends at x=14.5")
  const speed = (from: { at: number; x: number }, to: { at: number; x: number }) => (to.x - from.x) / (to.at - from.at)
  const flat = speed(start, spikes)
  const quick = speed(spikes, back)
  const relaxed = speed(back, end)
  assert.ok(flat < relaxed && relaxed < quick, "slower on the flat, quicker through the spikes (4.5..10.75), relaxed to the end")
  assert.ok(out.opacity === 0 && out.x >= 14.5 + 4, "the light fades out as the head leaves the stroke, not cut")
  assert.ok(out.at >= 1000 && out.at <= 1250, "the sweep takes about 1.1s")
  assert.ok(HEARTBEAT_LOOP * 1000 - out.at >= 1100, "then rests for the rest of the loop")
  assert.deepEqual([...HEARTBEAT_SWEEP.map((s) => s.at)].sort((a, b) => a - b), HEARTBEAT_SWEEP.map((s) => s.at))
})

test("the sweep keyframes: translateX puts the head at each stop, opacity brings it in and out, each segment has its own easing, the last stop holds to the end of the loop", () => {
  const found = stops(heartbeatSweepKeyframes)
  assert.equal(found.length, HEARTBEAT_SWEEP.length)
  found.forEach((stop, index) => {
    const want = HEARTBEAT_SWEEP[index]!
    assert.equal(Math.round(ms(stop.percent)), want.at)
    assert.match(stop.body, new RegExp(`transform: translateX\\(${want.x - HEARTBEAT_BAND}px\\); opacity: ${want.opacity};`))
    if (index < found.length - 1) assert.ok(stop.body.includes(`animation-timing-function: ${want.ease}`), `segment ${index} easing`)
  })
  assert.match(heartbeatSweepKeyframes, /, 100% \{/)
  assert.match(heartbeatSweepKeyframes, /@keyframes heartbeat-sweep/)
})

test("compositor only: the keyframes animate transform and opacity and nothing else, no mask, no clip-path, no composition", () => {
  const props = new Set([...heartbeatSweepKeyframes.matchAll(/([a-z-]+):/g)].map((m) => m[1]))
  for (const prop of props) assert.ok(["transform", "opacity", "animation-timing-function"].includes(prop!), `unexpected property ${prop}`)
  const all = heartbeatIconCss + heartbeatChipCss
  assert.doesNotMatch(all, /will-change|clip-path|animation-composition|@property/)
  assert.doesNotMatch(all, /animation: [^;}]*(mask|opacity-)/)
  assert.doesNotMatch(all, /transition: [^;}]*mask-size/)
})

test("the band is a gradient over the base icon token with a sharp head at its right edge and a long fade, the trace stays the muted token, nothing else is drawn", () => {
  assert.equal(HEARTBEAT_BAND, 9)
  const rule = heartbeatIconCss.match(/> b > i \{[^}]*\}/)![0]
  assert.match(rule, /width: 9px; height: 16px; background: linear-gradient\(90deg, transparent 0, /)
  assert.match(rule, /var\(--v2-icon-icon-base\) 95%, transparent 100%\)/, "the head: full colour at 95% then gone, 0.45px later")
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
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}"\\]\\)::before \\{ display: block; animation: heartbeat-sweep 2\\.4s infinite; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}"\\]\\)::after \\{ display: block; transition: none; \\}`))
  assert.ok(laneChipCss.includes(heartbeatChipCss.trim().split("\n")[0]!))
})

test("the stencil is the capsule's own background with a trace-shaped hole, from where the band starts to where the label starts, so no light shows outside the stroke", () => {
  const rule = heartbeatChipCss.match(/::after \{ position: absolute; z-index: 2;[^}]*\}/)![0]
  assert.match(rule, /background: inherit/)
  assert.match(rule, /left: 0px; top: calc\(50% - 9px\); width: 32px; height: 18px/)
  assert.match(rule, /mask-composite: exclude/)
  assert.match(rule, /mask-position: 0 0, 9px 1px/)
  assert.match(rule, /transform-origin: 0 9px/, "the baseline of the plane, one bleed pixel down")
  assert.equal(0 + 9, 9, "the hole sits on the glyph box")
  assert.equal(1 + 16 + 1, 18, "a pixel taller each side than the plane, so the plane never shows at the edge")
  assert.equal(0 + 32, 32, "the stencil ends where the label starts")
  const last = HEARTBEAT_SWEEP[HEARTBEAT_SWEEP.length - 1]!
  assert.ok(9 + last.x <= 32 && 9 - HEARTBEAT_BAND >= 0, "the band never leaves the stencil")
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

test("done: the trace squashes to the baseline over 300ms by scale, the flat line fades in, the light stops and everything leaves", () => {
  assert.match(heartbeatIconCss, /> b \{[^}]*transform-origin: 0 8px; transition: scale 300ms cubic-bezier\(0\.25, 0\.7, 0\.3, 1\), display 0s 320ms allow-discrete/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > b \{ scale: 1 0; display: none; \}/)
  assert.match(heartbeatIconCss, /> u \{[^}]*opacity: 0; transition: opacity 300ms cubic-bezier\(0\.25, 0\.7, 0\.3, 1\)/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] > u \{ opacity: 1; \}/)
  assert.doesNotMatch(heartbeatIconCss, /\[data-state="flat"\] > b > i/, "the band stays display: none in the flat state")
  const flat = HEARTBEAT_FLAT_PLACEHOLDER
  assert.match(heartbeatChipCss, new RegExp(`icon-${flat}"\\]\\) > svg \\{ scale: 1 0; display: none; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${flat}"\\]\\)::after \\{ scale: 1 0; \\}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${flat}"\\]\\) > span::before \\{ opacity: 1; \\}`))
  assert.doesNotMatch(heartbeatChipCss, new RegExp(`icon-${flat}"\\]\\)::before \\{ display: block`), "the band is only shown while live")
})

test("the chip draws the heartbeat only inside our two placeholder pills", () => {
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}`))
})

test("every animation the css names on the loop is one syncHeartbeats pins", () => {
  const named = [...(heartbeatIconCss + heartbeatChipCss).matchAll(/animation: (heartbeat-[a-z-]+) /g)].map((m) => m[1])
  assert.ok(named.length >= 2)
  for (const name of named) assert.ok(HEARTBEAT_ANIMATIONS.includes(name!), name)
})

test("heartbeats are pinned to the timeline origin when one starts, and the listener goes away", () => {
  const beats = [{ animationName: "heartbeat-sweep", startTime: 5 as number | null }, { animationName: "other", startTime: 7 as number | null }]
  const listeners = new Set<() => void>()
  const doc = {
    getAnimations: () => beats,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  } as unknown as Document
  const stop = syncHeartbeats(doc)
  assert.equal(beats[0]!.startTime, 0)
  assert.equal(beats[1]!.startTime, 7)
  beats[0]!.startTime = 3
  ;[...listeners].forEach((fn) => fn())
  assert.equal(beats[0]!.startTime, 0)
  stop()
  assert.equal(listeners.size, 0)
})
