import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HeartbeatIcon } from "./icons.js"
import { HEARTBEAT_ANIMATIONS, HEARTBEAT_CUTS, HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_LIVE_PLACEHOLDER, heartbeatChipCss, heartbeatIconCss, heartbeatKeyframes, heartbeatSweepKeyframes, syncHeartbeats } from "./heartbeat.js"
import { laneChipCss } from "./lane-chip-rows.js"

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

test("the row sweep is a transform on one child, the chip beat an opacity per layer: no timer, no script, nothing that repaints", () => {
  assert.match(heartbeatSweepKeyframes, /@keyframes heartbeat-sweep \{[^}]*transform/)
  assert.doesNotMatch(heartbeatSweepKeyframes, /opacity|stroke-dashoffset|mask|clip-path|background/)
  assert.match(heartbeatIconCss, /\[data-state="live"\] > i \{ display: block; animation: heartbeat-sweep 2s infinite; \}/)
  assert.match(heartbeatIconCss, /> i \{ display: none;/)
  for (const layer of ["lead", "spike", "tail"]) assert.match(heartbeatKeyframes, new RegExp(`@keyframes heartbeat-beat-${layer} \\{[^@]*opacity`))
  assert.doesNotMatch(heartbeatKeyframes, /transform|mask|clip-path|background/)
  assert.match(heartbeatChipCss, /::before \{ animation: heartbeat-beat-lead 2s infinite; \}/)
  assert.match(heartbeatChipCss, /> svg \{ animation: heartbeat-beat-spike 2s infinite; \}/)
  assert.match(heartbeatChipCss, /::after \{ animation: heartbeat-beat-tail 2s infinite; \}/)
})

test("the chip's layers are three slices of one trace that meet on whole device pixels, in the order lead, spike, tail", () => {
  for (const cut of HEARTBEAT_CUTS.slice(1, -1)) assert.ok(Math.abs(cut * 1.75 - Math.round(cut * 1.75)) < 0.01, `${cut} is not a whole device pixel at 2x`)
  const slices = [...[...heartbeatChipCss.matchAll(/data:image\/svg\+xml,([^"]+)"/g)].map((m) => decodeURIComponent(m[1]!)).join("\n").matchAll(/<rect x='([-\d.]+)' y='0' width='([\d.]+)'/g)].map((m) => [Number(m[1]), Number(m[1]) + Number(m[2])])
  const trace = slices.filter((_, i) => i % 2 === 0).slice(0, 3)
  assert.deepEqual(trace.map(([from]) => from), [-1, HEARTBEAT_CUTS[1], HEARTBEAT_CUTS[2]])
  assert.deepEqual(trace.map(([, to]) => to), [HEARTBEAT_CUTS[1], HEARTBEAT_CUTS[2], 17])
})

test("the layers rise in turn within the first half of the loop and rest at the same opacity", () => {
  const rest = [...heartbeatKeyframes.matchAll(/(?:^|\s)0%(?:, \d+%)? \{ opacity: ([\d.]+)/g)].map((m) => m[1])
  assert.equal(rest.length, 3)
  assert.equal(new Set(rest).size, 1)
  const peaks = [...heartbeatKeyframes.matchAll(/ (\d+)% \{ opacity: 1;/g)].map((m) => Number(m[1]))
  assert.deepEqual(peaks, [...peaks].sort((a, b) => a - b))
  const ends = [...heartbeatKeyframes.matchAll(/(\d+)%, 100% \{ opacity/g)].map((m) => Number(m[1]))
  assert.ok(Math.max(...ends) <= 50, "the beat is over by half of the loop, the rest of it is rest")
})

test("a row renders its sweep band, which only a live icon shows", () => {
  const host = document.createElement("div")
  document.body.append(host)
  const dispose = render(() => <HeartbeatIcon state="flat" />, host)
  assert.equal(host.querySelectorAll('[data-icon="heartbeat"] > i').length, 1)
  dispose()
})

test("reduced motion: no animation under the media query or data-motion=reduce, the flatten is instant", () => {
  assert.match(heartbeatIconCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(heartbeatIconCss, /:root\[data-motion="reduce"\] \[data-icon="heartbeat"\]\[data-state="live"\] > i \{ display: none; \}/)
  assert.match(heartbeatIconCss, /:root\[data-motion="reduce"\] \[data-icon="heartbeat"\] \{ transition: none; \}/)
  assert.match(heartbeatChipCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*::after[^{]*\{ animation: none/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*> svg[^{]*\{ animation: none/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*\{ transition: none; \}/)
})

test("the flat state squashes the trace to the baseline over 300ms and drops the beat", () => {
  assert.match(heartbeatIconCss, /transition: mask-size 300ms/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] \{[^}]*mask-size: 100% 0%, 100% 100%; \}/)
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}"\\]\\)::before[^{]*\\{ background: var\\(--v2-icon-icon-muted\\); opacity: 1; mask-size: 100% 0%, 100% 100%; animation: none; \\}`))
})

test("the chip draws the heartbeat only inside our two placeholder pills, and keeps the 14px box", () => {
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, /width: 14px; height: 14px/)
  assert.ok(laneChipCss.includes(heartbeatChipCss.trim().split("\n")[0]!))
})

test("every animation the css names is one syncHeartbeats pins", () => {
  const named = [...(heartbeatIconCss + heartbeatChipCss).matchAll(/animation: (heartbeat-[a-z-]+) /g)].map((m) => m[1])
  assert.ok(named.length >= 4)
  for (const name of named) assert.ok(HEARTBEAT_ANIMATIONS.includes(name!), name)
})

test("heartbeats are pinned to the timeline origin when one starts, and the listener goes away", () => {
  const beats = [{ animationName: "heartbeat-beat-spike", startTime: 5 as number | null }, { animationName: "other", startTime: 7 as number | null }, { animationName: "heartbeat-sweep", startTime: 2 as number | null }]
  const listeners = new Set<() => void>()
  const doc = {
    getAnimations: () => beats,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  } as unknown as Document
  const stop = syncHeartbeats(doc)
  assert.equal(beats[0]!.startTime, 0)
  assert.equal(beats[1]!.startTime, 7)
  assert.equal(beats[2]!.startTime, 0)
  beats[0]!.startTime = 3
  ;[...listeners].forEach((fn) => fn())
  assert.equal(beats[0]!.startTime, 0)
  stop()
  assert.equal(listeners.size, 0)
})
