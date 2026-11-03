// The heartbeat: an ECG trace in the host's outline style (0.9px stroke, round caps and joins), a classic P-QRS-T drawn as a CSS mask
// over a flat muted colour, with a bright DOT that runs along it while a monitor is live (a heart monitor's cursor) and leaves a
// short fading tail. The trace is a fine muted line at rest; the dot is the pulse.
//
// One drawing and one path. `HEARTBEAT_POINTS` is the trace and the route of the dot (a polyline, so a dot moving in a straight line
// between two keyframes stays exactly on the stroke); `HEARTBEAT_RUN` says how long the dot takes over each segment and how it
// eases: slow along the flats, a flick through the QRS, a long ease-out to park at the right end. `heartbeatDotKeyframes` is built from
// both, so the drawing and the dot cannot drift apart.
//
// Compositor only. The dot moves by `transform: translate()` and fades by `opacity` (the mask and clip-path windows the first two
// versions tried repaint or re-rasterise every frame: measured, see native-ui DESIGN). Every instance runs the same keyframes,
// pinned to the document timeline origin by `syncHeartbeats`, so all beat in phase.
//   rows   (`HeartbeatIcon`, popover rows and timeline) a 16px span: `<b>` is the masked trace, three `<i>` are the dot and its two
//          trailing dots.
//   chip   (the host's capsule: no child can be added, but it holds the catalog `svg` and its label `span`, and each has two
//          pseudo-elements) the `svg` is the masked trace, the capsule's `::before` the dot, its `::after` and the label's
//          `::before` the trailing dots. The capsule keeps its box: the glyph is a 16px box centred on the 14px slot the catalog svg had.
//   flat   the line a monitor ends on, muted. The trace is squashed to the baseline over 300ms while the flat line grows in, and
//          the dots fade out over the first 220ms, still travelling.

/** The trace and the route of the dot, in a 16 x 16 box with the baseline at y=8: lead-in, P, flat, Q, R, S, flat, T, tail. */
export const HEARTBEAT_POINTS = [
  [1, 8],
  [2.6, 8],
  [3.3, 6.8],
  [4.1, 6.8],
  [4.8, 8],
  [5.9, 8],
  [6.4, 8.9],
  [7.3, 2],
  [8.4, 14],
  [9.3, 8],
  [10.4, 8],
  [11.2, 6.5],
  [12.3, 6.5],
  [13.1, 8],
  [15, 8],
] as const satisfies readonly (readonly [number, number])[]

const LINEAR = "linear"
// Emil Kowalski's strong ease-out: the dot arrives at the end of the trace quickly and settles there.
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"

/** Milliseconds the dot spends on each segment of `HEARTBEAT_POINTS` (the same count minus one), and the easing leaving each vertex. */
export const HEARTBEAT_RUN: readonly (readonly [ms: number, ease: string])[] = [
  [90, LINEAR], // lead-in flat
  [45, LINEAR], // P up
  [28, LINEAR], // P top
  [45, LINEAR], // P down
  [60, LINEAR], // flat
  [30, LINEAR], // Q dip
  [38, LINEAR], // R, up the spike
  [56, LINEAR], // S, down through it
  [36, LINEAR], // back to the baseline
  [50, LINEAR], // flat
  [55, LINEAR], // T up
  [36, LINEAR], // T top
  [55, LINEAR], // T down
  [200, EASE_OUT], // out to the end, and park
]

export const HEARTBEAT_TRACE = `M${HEARTBEAT_POINTS.map(([x, y]) => `${x} ${y}`).join("L")}`
export const HEARTBEAT_FLAT = "M2 8H14"

/** Seconds per beat. */
export const HEARTBEAT_LOOP = 2

/** Catalog icons a plugin pill names so the host renders a pill with a glyph we then replace (`laneChipCss`): one per state. */
export const HEARTBEAT_LIVE_PLACEHOLDER = "outline-wave-audio" as const
export const HEARTBEAT_FLAT_PLACEHOLDER = "outline-dots" as const

const STROKE = 0.9
const svg = (body: string) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='#000' stroke-width='${STROKE}' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`
const url = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(svg(body))}")`
const path = (d: string) => `<path d='${d}'/>`

export const heartbeatMasks = { trace: url(path(HEARTBEAT_TRACE)), flat: url(path(HEARTBEAT_FLAT)) } as const

export type HeartbeatState = "live" | "still" | "flat"

// An ease-out softer than the host's 0.23,1,0.32,1 (90% in 100ms): the flattening is the point of the motion, so it has to be seen across the 300ms.
const EASE = "cubic-bezier(0.25, 0.7, 0.3, 1)"
const SETTLE_MS = 300
/** y of the trace's baseline in the 16px box, which the settle squashes everything onto. */
const BASELINE = 8
/** The dots fade out this long after a monitor ends, and are taken out of the render tree (their animation stops) once it has. */
const GONE_MS = 220
const GONE_HOLD_MS = 260

const DOT = "heartbeat-dot"
const GONE = "heartbeat-gone"
export const HEARTBEAT_ANIMATIONS: readonly string[] = [DOT]

/**
 * Size of the dot (px; every dot is drawn in the same 3px box so one set of keyframes centres them all), and for each trailing dot
 * its lag behind the dot (ms), its radius in px and how much of the dot's colour it keeps.
 */
const DOT_SIZE = 3
export const HEARTBEAT_TAILS = [
  { name: "near", lag: 32, radius: 1.25, alpha: 62 },
  { name: "far", lag: 64, radius: 1, alpha: 34 },
] as const

const FADE_IN_MS = 36
const FADE_OUT_FROM_MS = 760
const FADE_OUT_TO_MS = 940

const num = (value: number) => +value.toFixed(2)
const pct = (ms: number) => `${num((ms / (HEARTBEAT_LOOP * 1000)) * 100)}%`
const place = ([x, y]: readonly [number, number]) => `translate(${num(x - DOT_SIZE / 2)}px, ${num(y - DOT_SIZE / 2)}px)`

/**
 * The dot's one keyframe track: translate stops at every vertex of the trace (so it follows the stroke), each with the easing
 * of the segment it leaves; opacity stops that never share a time with a vertex (the invisible start shares the first), so each property keeps its own easing. After the
 * last vertex it parks until the loop ends, invisible.
 */
export const heartbeatDotKeyframes = (() => {
  const times = HEARTBEAT_RUN.reduce<number[]>((acc, [ms]) => [...acc, acc[acc.length - 1]! + ms], [0])
  const vertices = HEARTBEAT_POINTS.map((point, index) => {
    const ease = HEARTBEAT_RUN[index]?.[1]
    return `${pct(times[index]!)} { transform: ${place(point)};${index === 0 ? " opacity: 0;" : ""}${ease ? ` animation-timing-function: ${ease};` : ""} }`
  })
  vertices.push(`100% { transform: ${place(HEARTBEAT_POINTS[HEARTBEAT_POINTS.length - 1]!)}; }`)
  const opacity = [
    `${pct(FADE_IN_MS)} { opacity: 1; animation-timing-function: ${LINEAR}; }`,
    `${pct(FADE_OUT_FROM_MS)} { opacity: 1; animation-timing-function: ${EASE_OUT}; }`,
    `${pct(FADE_OUT_TO_MS)}, 100% { opacity: 0; }`,
  ]
  for (const stop of opacity) for (const t of times) if (stop.startsWith(`${pct(t)} `)) throw new Error(`opacity stop shares a time with a vertex: ${stop}`)
  return `@keyframes ${DOT} {\n  ${[...vertices, ...opacity].join("\n  ")}\n}`
})()

/** Fades whatever the dot animation shows to nothing: added on top of it, so the dots carry on along the path while they go. */
export const heartbeatGoneKeyframes = `@keyframes ${GONE} { from { opacity: 0; } to { opacity: -1; } }`

const REDUCED = ':root[data-motion="reduce"]'
const each = (list: string, wrap: (selector: string) => string) => list.split(", ").map(wrap).join(", ")
const reduced = (selector: string) => `${REDUCED} ${selector}`
const reducedMedia = (css: string) => `@media (prefers-reduced-motion: reduce) { ${css} }`

// The strongest text token: the base icon token is 2.9:1 against the muted trace in light, the text one 4.6:1 (dark: 3.8:1, the most the
// unchanged muted trace allows).
const DOT_COLOUR = "var(--v2-text-text-base)"
const MUTED = "var(--v2-icon-icon-muted)"
const HALO = `0 0 2.5px 0.5px color-mix(in srgb, ${DOT_COLOUR} 30%, transparent)`

type Dot = { name: string; lag: number; radius: number; alpha: number }
const dots: readonly Dot[] = [{ name: "head", lag: 0, radius: DOT_SIZE / 2, alpha: 100 }, ...HEARTBEAT_TAILS]

// The head is a pixel-aligned 3px box with a border-radius. A trailing dot is smaller than its box: a soft-edged disc, because a
// `scale` would shrink the translation too (the individual properties apply before `transform`).
const dotPaint = ({ radius, alpha }: Dot) => {
  const colour = alpha === 100 ? DOT_COLOUR : `color-mix(in srgb, ${DOT_COLOUR} ${alpha}%, transparent)`
  if (alpha === 100) return `background: ${colour}; border-radius: 50%; box-shadow: ${HALO}`
  const side = DOT_SIZE / 2
  return `background: radial-gradient(circle closest-side, ${colour} ${num(((radius - 0.3) / side) * 100)}%, transparent ${num(((radius + 0.3) / side) * 100)}%)`
}

// Taking the dots out: they flatten onto the baseline with the trace (the same curve, the origin on the baseline, so each stays on the
// stroke as it collapses), fade, and leave the render tree once the fade is over, which stops their animation.
const dotsOut = `scale ${SETTLE_MS}ms ${EASE}, display 0s ${GONE_HOLD_MS}ms allow-discrete`
const FLATTENED = "scale: 1 0"

const dotLook = (dot: Dot) =>
  [
    "position: absolute",
    "z-index: 1",
    `width: ${DOT_SIZE}px`,
    `height: ${DOT_SIZE}px`,
    dotPaint(dot),
    "opacity: 0",
    `transform-origin: 0 ${BASELINE}px`,
    `transform: ${place(HEARTBEAT_POINTS[0])}`,
    "pointer-events: none",
  ].join("; ")

const lag = (ms: number) => `${DOT} ${HEARTBEAT_LOOP}s ${ms}ms infinite`
const liveAnimation = (ms: number) => `animation: ${lag(ms)}; animation-composition: replace`
const goneAnimation = (ms: number) => `animation: ${lag(ms)}, ${GONE} ${GONE_MS}ms ease-out forwards; animation-composition: replace, add`

const ROW = '[data-icon="heartbeat"]'
const span = (state: string) => `${ROW}[data-state="${state}"]`
const rowDot = (name: string) => `${ROW} > i[data-dot="${name}"]`

/**
 * The span `HeartbeatIcon` renders, in the rows and the timeline: `<b>` the trace (masked, muted), `<i>` the dot and its two
 * trailing dots, drawn only while live.
 */
export const heartbeatIconCss = `${heartbeatDotKeyframes}
${heartbeatGoneKeyframes}
${ROW} { display: inline-block; flex: none; position: relative; width: 16px; height: 16px; }
${ROW} > b { position: absolute; inset: 0; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-image: ${heartbeatMasks.trace}, ${heartbeatMasks.flat}; mask-size: 100% 100%, 100% 0%; transition: mask-size ${SETTLE_MS}ms ${EASE}; }
${ROW} > i { left: 0; top: 0; display: none; transition: ${dotsOut}; }
${dots.map((d) => `${rowDot(d.name)} { ${dotLook(d)}; }`).join("\n")}
${span("live")} > i { display: block; transition: none; }
${dots.map((d) => `${span("live")} > i[data-dot="${d.name}"] { ${liveAnimation(d.lag)}; }`).join("\n")}
${span("flat")} > b { mask-size: 100% 0%, 100% 100%; }
${dots.map((d) => `${span("flat")} > i[data-dot="${d.name}"] { ${FLATTENED}; ${goneAnimation(d.lag)}; }`).join("\n")}
${reducedMedia(`${ROW} > i { display: none; animation: none; } ${ROW} > b { transition: none; }`)}
${REDUCED} ${ROW} > i { display: none; animation: none; }
${REDUCED} ${ROW} > b { transition: none; }
`

const PILL = '[data-slot="session-plugin-pill"]'
const pillHas = (icon: string) => `${PILL}:has(use[href$="icon-${icon}"])`
const LIVE_PILL = pillHas(HEARTBEAT_LIVE_PLACEHOLDER)
const FLAT_PILL = pillHas(HEARTBEAT_FLAT_PLACEHOLDER)
const HOSTS = `${LIVE_PILL}, ${FLAT_PILL}`

// Where each part of the chip's heartbeat lives, in the order head, near, far. The label is a static box, so what is absolute inside it
// is placed against the capsule, like the capsule's own pseudo-elements.
const CHIP_DOT_HOSTS = ["::before", " > span::before", "::after"] as const
const chipDot = (host: string, index: number) => `${host}${CHIP_DOT_HOSTS[index]}`
const chipDots = (host: string) => dots.map((_, index) => each(host, (h) => chipDot(h, index)))

/** Glyph box: 16px, centred on the 14px slot (10px inset) the catalog svg had, so the capsule and its label do not move. */
const GLYPH = 16
const GLYPH_LEFT = 9

/** The capsule of a plugin pill that names one of the two placeholders: its catalog glyph is replaced by the trace, the dots by pseudo-elements. */
export const heartbeatChipCss = `${heartbeatDotKeyframes}
${heartbeatGoneKeyframes}
${HOSTS} { position: relative; padding-inline-start: calc(10px + 14px + 8px); }
${each(HOSTS, (h) => `${h}::before, ${h}::after, ${h} > span::before`)} { content: ""; }
${each(HOSTS, (h) => `${h} > svg use`)} { display: none; }
${each(HOSTS, (h) => `${h} > svg`)} { position: absolute; left: ${GLYPH_LEFT}px; top: calc(50% - ${GLYPH / 2}px); width: ${GLYPH}px; height: ${GLYPH}px; margin: 0; display: block; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-image: ${heartbeatMasks.trace}, ${heartbeatMasks.flat}; mask-size: 100% 100%, 100% 0%; transition: mask-size ${SETTLE_MS}ms ${EASE}; pointer-events: none; }
${dots.map((d, index) => `${each(HOSTS, (h) => chipDot(h, index))} { ${dotLook(d)}; left: ${GLYPH_LEFT}px; top: calc(50% - ${GLYPH / 2}px); display: none; transition: ${dotsOut}; }`).join("\n")}
${dots.map((d, index) => `${each(LIVE_PILL, (h) => chipDot(h, index))} { display: block; transition: none; ${liveAnimation(d.lag)}; }`).join("\n")}
${each(FLAT_PILL, (h) => `${h} > svg`)} { mask-size: 100% 0%, 100% 100%; }
${dots.map((d, index) => `${each(FLAT_PILL, (h) => chipDot(h, index))} { ${FLATTENED}; ${goneAnimation(d.lag)}; }`).join("\n")}
${reducedMedia(`${chipDots(HOSTS).join(", ")} { display: none; animation: none; } ${each(HOSTS, (h) => `${h} > svg`)} { transition: none; }`)}
${chipDots(HOSTS).map((s) => each(s, reduced)).join(", ")} { display: none; animation: none; }
${each(HOSTS, (h) => reduced(`${h} > svg`))} { transition: none; }
`

/**
 * Puts every heartbeat on the document timeline's origin so all of them beat in phase, whenever they mounted. The animation
 * belongs to a pseudo-element for the chip, so it is found through the document and matched by name. Call in `setup`; the
 * listener goes with the owner.
 */
export function syncHeartbeats(doc: Document = document): () => void {
  const pin = () => {
    for (const animation of doc.getAnimations()) {
      if (HEARTBEAT_ANIMATIONS.includes((animation as CSSAnimation).animationName) && animation.startTime !== 0) animation.startTime = 0
    }
  }
  doc.addEventListener("animationstart", pin, true)
  pin()
  return () => doc.removeEventListener("animationstart", pin, true)
}
