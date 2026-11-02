// The host animates its side panel with a critically damped spring (bounce 0) stepped in JS; the duration it feeds the
// spring grows with the distance moved: 0.3s * sqrt(distance / 480), clamped to 0.15s..0.3s. The spring is at rest once
// it is within 0.005 of its target on a 0..100 scale and slower than 0.02 per second. This module reproduces the same
// curve as a CSS `linear()` easing, so a Web Animation (compositor driven) moves exactly as the host's JS loop does.

const REFERENCE = 480
const MIN_S = 0.15
const MAX_S = 0.3
const BASE_S = 0.3

/** The host's spring duration, in seconds, for something that moves `distance` px. */
export function springDuration(distance: number) {
  if (!(distance > 0)) return BASE_S
  return Math.min(MAX_S, Math.max(MIN_S, BASE_S * Math.sqrt(distance / REFERENCE)))
}

/** Progress 0..1 of a critically damped spring after `seconds`, for a spring of the given duration. */
export function springProgress(duration: number, seconds: number) {
  const omega = (2 * Math.PI) / duration
  const x = omega * seconds
  return 1 - (1 + x) * Math.exp(-x)
}

/** Seconds until the host's rest test passes: remaining < 0.005% of the travel and speed < 0.02%/s of it. */
export function springRest(duration: number) {
  const omega = (2 * Math.PI) / duration
  let t = duration
  for (; t < duration * 10; t += 0.001) {
    const x = omega * t
    const remaining = (1 + x) * Math.exp(-x)
    const speed = omega * omega * t * Math.exp(-x)
    if (remaining * 100 < 0.005 && speed * 100 < 0.02) break
  }
  return t
}

/** The spring as `linear(...)`: 0 to 1 over `springRest(duration)`, points packed where it moves fastest. */
export function springEasing(duration: number, points = 48) {
  const rest = springRest(duration)
  const stops = Array.from({ length: points + 1 }, (_, i) => {
    const u = i / points
    const progress = i === points ? 1 : springProgress(duration, rest * u * u)
    return `${+progress.toFixed(4)} ${+(u * u * 100).toFixed(2)}%`
  })
  return `linear(${stops.join(", ")})`
}
