/**
 * The host's composer docks (queue panel, go-limit tray, question dock) open and close on its "smooth" spring: a unit
 * mass with omega = 2π / 0.4 s and zeta = 1 (`Spring.fromDuration`, `docks.morph` in `spring-height.tsx`). Zeta 1 is
 * the critically damped step response, which has a closed form, so a CSS `linear()` easing can replay it exactly.
 */
const DURATION = 0.4
const OMEGA = (2 * Math.PI) / DURATION

/** The spring's progress from 0 to 1 after `t` seconds. */
export function progress(t: number) {
  return 1 - (1 + OMEGA * t) * Math.exp(-OMEGA * t)
}

/** The host stops a height spring within half a pixel; on a tray of about 48px that is a hundredth of its travel. */
const REST = 0.01

/** Seconds until the spring is within `REST` of its target. */
export const SETTLE = (() => {
  let t = 0

  while (1 - progress(t) > REST) t += 0.001

  return t
})()

/**
 * A CSS `linear()` easing that plays `shape(progress)` over the spring's settle time. `shape` maps the spring's
 * progress to the property's progress; the identity is the movement itself.
 */
export function easing(shape: (spring: number) => number, points = 24) {
  const values = Array.from({ length: points + 1 }, (_, index) => {
    const spring = index === points ? 1 : progress((index / points) * SETTLE)

    return Number(shape(spring).toFixed(4))
  })

  return `linear(${values.join(", ")})`
}

/** Opening: the box travels with the spring; opacity follows its square, so the face fades in late. */
export const move = (spring: number) => spring
export const fadeIn = (spring: number) => spring * spring

/** Closing: the box retracts with the spring; the face stays opaque until 40% of the box is left, then fades out. */
export const fadeOut = (spring: number) => Math.max(0, (spring - 0.6) / 0.4)
