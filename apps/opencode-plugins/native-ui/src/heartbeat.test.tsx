import assert from "node:assert/strict"
import { test } from "node:test"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HeartbeatIcon } from "./icons.js"
import { HEARTBEAT_FLAT_PLACEHOLDER, HEARTBEAT_LIVE_PLACEHOLDER, heartbeatChipCss, heartbeatIconCss, heartbeatKeyframes, heartbeatSweepKeyframes, syncHeartbeats } from "./heartbeat.js"
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

test("the row sweep is a transform on one child, the chip flash an opacity on a pseudo-element: no timer, no script", () => {
  assert.match(heartbeatSweepKeyframes, /@keyframes heartbeat-sweep \{[^}]*transform/)
  assert.doesNotMatch(heartbeatSweepKeyframes, /opacity|stroke-dashoffset|mask/)
  assert.match(heartbeatIconCss, /\[data-state="live"\] > i \{ display: block; animation: heartbeat-sweep 2s infinite; \}/)
  assert.match(heartbeatIconCss, /> i \{ display: none;/)
  assert.match(heartbeatKeyframes, /@keyframes heartbeat-beat \{[^}]*opacity/)
  assert.doesNotMatch(heartbeatKeyframes, /transform|mask/)
  assert.match(heartbeatChipCss, /::after \{ animation: heartbeat-beat 2s infinite; \}/)
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
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*::after \{ animation: none/)
  assert.match(heartbeatChipCss, /:root\[data-motion="reduce"\][^{]*\{ transition: none; \}/)
})

test("the flat state squashes the trace to the baseline over 300ms and drops the beat", () => {
  assert.match(heartbeatIconCss, /transition: mask-size 300ms/)
  assert.match(heartbeatIconCss, /\[data-state="flat"\] \{[^}]*mask-size: 100% 0%, 100% 100%; \}/)
  assert.match(heartbeatChipCss, /\[data-state="flat"\]|FLAT|icon-outline-dots/)
})

test("the chip draws the heartbeat only inside our two placeholder pills, and keeps the 14px box", () => {
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_LIVE_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, new RegExp(`icon-${HEARTBEAT_FLAT_PLACEHOLDER}`))
  assert.match(heartbeatChipCss, /width: 14px; height: 14px/)
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
