import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HeartbeatIcon } from "./icons.js"
import { HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_LIVE_PLACEHOLDER, HEARTBEAT_LOOP, HEARTBEAT_TRACE, heartbeatChipCss, heartbeatIconCss, heartbeatKeyframes, heartbeatMasks, syncHeartbeats } from "./heartbeat.js"
import { laneChipCss } from "./lane-chip-rows.js"

const stops = (css: string) => [...css.matchAll(/(\d+(?:\.\d+)?)%(?:, 100%)? \{ opacity: (\d*\.?\d+);/g)].map((m) => ({ percent: Number(m[1]), opacity: Number(m[2]) }))
const ms = (percent: number) => (percent / 100) * HEARTBEAT_LOOP * 1000

test("the icon is a span carrying its state, and a change of state keeps the same node", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const [state, setState] = createSignal<"live" | "still" | "flat">("live")
  const dispose = render(() => <HeartbeatIcon state={state()} />, host)
  const icon = host.querySelector<HTMLElement>('[data-icon="heartbeat"]')!
  assert.equal(icon.dataset.state, "live")
  assert.equal(icon.children.length, 0, "the layers are its pseudo-elements: one node, nothing to travel")
  setState("flat")
  assert.equal(host.querySelector('[data-icon="heartbeat"]'), icon)
  assert.equal(icon.dataset.state, "flat")
  dispose()
})

test("the trace is the simple one: flat, one up spike, one down spike, a small return, flat; centred on the baseline, 13px of ink or more", () => {
  assert.equal(HEARTBEAT_TRACE, "M1.5 8H4.5L6 4L8 12L9.75 6.5L10.75 8H14.5")
  assert.doesNotMatch(HEARTBEAT_TRACE, /[CQS]/)
  assert.equal(4 + 12, 2 * 8, "the spikes are as far above the baseline as below it, so the chip glyph's centre is the clock's")
  assert.ok(14.5 - 1.5 >= 13, "no shorter than the first version's 13px")
  assert.match(heartbeatMasks.trace, /stroke-width%3D'0\.9'/)
  assert.match(heartbeatMasks.trace, /stroke-linecap%3D'round'/)
})

test("the beat: one opacity keyframe on a pseudo-element, a quick rise then a lub-dub, then a long rest; no timer, no script", () => {
  const found = stops(heartbeatKeyframes)
  assert.deepEqual(found.map((s) => s.opacity), [0, 1, 0, 0.8, 0], "rest, flash, dip, softer second flash, rest")
  const [, flash, dip, second, rest] = found
  assert.ok(ms(flash!.percent) <= 120, "a quick rise")
  assert.ok(second!.opacity < flash!.opacity && dip!.opacity < second!.opacity, "the second flash is softer, the dip is below it")
  assert.ok(ms(dip!.percent) - ms(flash!.percent) < ms(rest!.percent) - ms(second!.percent), "the fall is slower than the rise and dip")
  assert.ok(HEARTBEAT_LOOP * 1000 - ms(rest!.percent) >= 1200, "rests for at least half the loop")
  assert.match(heartbeatKeyframes, /@keyframes heartbeat-beat/)
  assert.match(heartbeatIconCss, /\[data-icon="heartbeat"\]\[data-state="live"\]::after \{ animation: heartbeat-beat 2\.4s infinite; \}/)
})

test("compositor only: the loop animates opacity and nothing else", () => {
  const props = new Set([...heartbeatKeyframes.matchAll(/([a-z-]+):/g)].map((m) => m[1]))
  for (const prop of props) assert.ok(["opacity", "animation-timing-function"].includes(prop!), `unexpected property ${prop}`)
  const all = heartbeatIconCss + heartbeatChipCss
  assert.doesNotMatch(all, /will-change|clip-path|animation-composition|translate|@property/)
  assert.doesNotMatch(all, /animation: [^;}]*mask/)
})

test("the dim trace always reads, the bright layer rests at nothing and holds steady when still", () => {
  assert.match(heartbeatIconCss, /\[data-icon="heartbeat"\]::before \{ opacity: 0\.6; \}/)
  assert.match(heartbeatIconCss, /\[data-icon="heartbeat"\]::after \{ opacity: 0; \}/)
  assert.match(heartbeatIconCss, /\[data-state="still"\]::after \{ opacity: 0\.8; \}/)
})

test("reduced motion: no animation under the media query or data-motion=reduce, the flatten is instant", () => {
  for (const css of [heartbeatIconCss, heartbeatChipCss]) {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(css, /:root\[data-motion="reduce"\][^{]*::after \{ animation: none/)
    assert.match(css, /:root\[data-motion="reduce"\][^{]*\{ transition: none; \}/)
  }
})

test("the flat state squashes the trace to the baseline over 300ms and drops the beat", () => {
  assert.match(heartbeatIconCss, /transition: mask-size 300ms/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\]::before, \[data-icon="heartbeat"\]\[data-state="flat"\]::after \{ mask-size: 100% 0%, 100% 100%; \}/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\]::after \{ opacity: 0; animation: none; \}/)
})

test("the chip draws the heartbeat only inside our two placeholder pills, in a 16px box centred on the 14px slot, and keeps the capsule's padding", () => {
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, /inset-inline-start: 9px; width: 16px; height: 16px/)
  assert.equal(9 + 16 / 2, 10 + 14 / 2, "the glyph centre is the old slot's centre")
  assert.match(heartbeatChipCss, /padding-inline-start: calc\(10px \+ 14px \+ 8px\)/)
  assert.ok(laneChipCss.includes(heartbeatChipCss.trim().split("\n")[0]!))
})

test("heartbeats are pinned to the timeline origin when one starts, and the listener goes away", () => {
  const beats = [{ animationName: "heartbeat-beat", startTime: 5 as number | null }, { animationName: "other", startTime: 7 as number | null }]
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
