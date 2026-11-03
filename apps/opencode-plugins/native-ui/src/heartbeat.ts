// The heartbeat: an ECG trace in the host's 16px outline style (0.9px stroke, round caps and joins), drawn as a CSS mask over a flat
// muted colour. While a monitor is live a head of light sweeps along the stroke left to right, like a heart-rate monitor, with a
// soft tail behind it that cools back to the muted colour: only the stroke lights up, nothing sits on top of it, the outline never
// changes.
//
// Compositor only. The light is one narrow gradient box (sharp head at its right edge, long fade to the left) moved by
// `transform: translateX()` and faded by `opacity`; the masks and clip-paths older versions animated repaint or re-rasterise every
// frame (measured, see native-ui DESIGN). Every instance runs the same keyframes, pinned to the document timeline origin by
// `syncHeartbeats`, so all sweep in phase.
//   rows   (`HeartbeatIcon`, popover rows and timeline) a 16px span: `<b>` is the trace (a mask over the muted colour) and holds
//          the band `<i>`, which the mask clips to the stroke; `<u>` is the flat line.
//   chip   (the host's capsule: no child can be added, but it holds the catalog `svg` and its label `span`, and each has two
//          pseudo-elements) the `svg` is the trace, the capsule's `::before` the band, its `::after` a stencil over the band (the
//          capsule's own background, `inherit`, with a trace-shaped hole, so the band shows only through the stroke and follows the
//          capsule's hover, pressed and expanded backgrounds), the label's `::before` the flat line.
//   flat   the line a monitor ends on, muted. The trace is squashed to the baseline over 300ms while the flat line fades in; the
//          light stops at once.

/** The trace in a 16 x 16 box with the baseline at y=8: flat, one up spike, one down spike, a small return, flat. */
export const HEARTBEAT_TRACE = "M1.5 8H4.5L6 4L8 12L9.75 6.5L10.75 8H14.5"
export const HEARTBEAT_FLAT = "M1.5 8H14.5"

/** Seconds per sweep: the light crosses the trace, then rests. */
export const HEARTBEAT_LOOP = 2.4

/** Catalog icons a plugin pill names so the host renders a pill with a glyph we then replace (`laneChipCss`): one per state. */
export const HEARTBEAT_LIVE_PLACEHOLDER = "outline-wave-audio" as const
export const HEARTBEAT_FLAT_PLACEHOLDER = "outline-dots" as const

const STROKE = 0.9
const svg = (body: string) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='#000' stroke-width='${STROKE}' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`
const url = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(svg(body))}")`
const path = (d: string) => `<path d='${d}'/>`

export const heartbeatMasks = { trace: url(path(HEARTBEAT_TRACE)), flat: url(path(HEARTBEAT_FLAT)) } as const

export type HeartbeatState = "live" | "still" | "flat"

/** Width of the band of light, head at its right edge. */
/** The light's opacity at its brightest: the base icon token over the muted trace, about 2.7:1 (light and dark). */
const PEAK = 0.96
export const HEARTBEAT_BAND = 9
/**
 * Where the head is (x in the 16px box) and when (ms on the loop), segment by segment: in at the trace's left end, slow over the first flat,
 * quicker through the spikes, relaxed to the end, then out past the right end while the light fades. The stroke's x extent is 1.5..14.5.
 */
export const HEARTBEAT_SWEEP = [
  { at: 0, x: 0, opacity: 0, ease: "linear" },
  { at: 90, x: 1.5, opacity: PEAK, ease: "linear" },
  { at: 340, x: 4.5, opacity: PEAK, ease: "linear" },
  { at: 670, x: 10.75, opacity: PEAK, ease: "linear" },
  { at: 920, x: 14.5, opacity: PEAK, ease: "cubic-bezier(0.25, 0.6, 0.5, 1)" },
  { at: 1140, x: 19.5, opacity: 0, ease: "linear" },
] as const

const BOX = 16
const BASE = "var(--v2-icon-icon-base)"
const MUTED = "var(--v2-icon-icon-muted)"
const tint = (percent: number) => `color-mix(in srgb, ${BASE} ${percent}%, transparent)`
/** A sharp, bright head and a long tail that falls away behind it. */
const BAND_PAINT = `background: linear-gradient(90deg, transparent 0, ${tint(9)} 20%, ${tint(26)} 45%, ${tint(55)} 70%, ${tint(90)} 90%, ${BASE} 95%, transparent 100%)`

// An ease-out softer than the host's 0.23,1,0.32,1 (90% in 100ms): the flattening is the point of the motion, so it has to be seen across the 300ms.
const EASE = "cubic-bezier(0.25, 0.7, 0.3, 1)"
const SETTLE_MS = 300
/** y of the trace's baseline in the 16px box, which the settle squashes everything onto. */
const BASELINE = 8
/** The squashed parts leave the render tree once the squash is over. */
const GONE_HOLD_MS = 320

const SWEEP = "heartbeat-sweep"
export const HEARTBEAT_ANIMATIONS: readonly string[] = [SWEEP]

const pct = (ms: number) => `${+((ms / (HEARTBEAT_LOOP * 1000)) * 100).toFixed(3)}%`
const px = (value: number) => `${+value.toFixed(2)}px`

/** The band's one keyframe track: `translateX` puts its head at the stop's x, `opacity` brings it in and takes it out; the last stop holds to the loop's end. */
export const heartbeatSweepKeyframes = `@keyframes ${SWEEP} {
${HEARTBEAT_SWEEP.map((stop, index, all) => {
  const last = index === all.length - 1
  return `  ${pct(stop.at)}${last ? ", 100%" : ""} { transform: translateX(${px(stop.x - HEARTBEAT_BAND)}); opacity: ${stop.opacity};${last ? "" : ` animation-timing-function: ${stop.ease};`} }`
}).join("\n")}
}`

const REDUCED = ':root[data-motion="reduce"]'
const each = (list: string, wrap: (selector: string) => string) => list.split(", ").map(wrap).join(", ")
const reduced = (selector: string) => `${REDUCED} ${selector}`
const reducedMedia = (css: string) => `@media (prefers-reduced-motion: reduce) { ${css} }`

const squash = `scale ${SETTLE_MS}ms ${EASE}, display 0s ${GONE_HOLD_MS}ms allow-discrete`
const FLATTENED = "scale: 1 0"

const bandLook = [
  "position: absolute",
  "z-index: 1",
  "top: 0",
  `width: ${HEARTBEAT_BAND}px`,
  `height: ${BOX}px`,
  BAND_PAINT,
  "opacity: 0",
  `transform: translateX(${px(-HEARTBEAT_BAND)})`,
  "pointer-events: none",
].join("; ")

const sweepLoop = `animation: ${SWEEP} ${HEARTBEAT_LOOP}s infinite`

const ROW = '[data-icon="heartbeat"]'
const span = (state: string) => `${ROW}[data-state="${state}"]`

/**
 * The span `HeartbeatIcon` renders, in the rows and the timeline: `<b>` the trace (masked, muted) holding `<i>`, the band the mask
 * clips to the stroke (drawn only while live), `<u>` the flat line.
 */
export const heartbeatIconCss = `${heartbeatSweepKeyframes}
${ROW} { display: inline-block; flex: none; position: relative; width: ${BOX}px; height: ${BOX}px; }
${ROW} > b { position: absolute; inset: 0; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.trace}; transform-origin: 0 ${BASELINE}px; transition: ${squash}; }
${ROW} > b > i { ${bandLook}; left: 0; display: none; }
${ROW} > u { position: absolute; inset: 0; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.flat}; opacity: 0; transition: opacity ${SETTLE_MS}ms ${EASE}; }
${span("live")} > b > i { display: block; ${sweepLoop}; }
${span("flat")} > b { ${FLATTENED}; display: none; }
${span("flat")} > u { opacity: 1; }
${reducedMedia(`${ROW} > b > i { display: none; animation: none; } ${ROW} > b, ${ROW} > u { transition: none; }`)}
${REDUCED} ${ROW} > b > i { display: none; animation: none; }
${REDUCED} ${ROW} > b, ${REDUCED} ${ROW} > u { transition: none; }
`

const PILL = '[data-slot="session-plugin-pill"]'
const pillHas = (icon: string) => `${PILL}:has(use[href$="icon-${icon}"])`
const LIVE_PILL = pillHas(HEARTBEAT_LIVE_PLACEHOLDER)
const FLAT_PILL = pillHas(HEARTBEAT_FLAT_PLACEHOLDER)
const HOSTS = `${LIVE_PILL}, ${FLAT_PILL}`

/** Glyph box: 16px, centred on the 14px slot (10px inset) the catalog svg had, so the capsule and its label do not move. */
const GLYPH = 16
const GLYPH_LEFT = 9
const GLYPH_TOP = `calc(50% - ${GLYPH / 2}px)`
/**
 * The stencil spans the band's whole travel (the band starts `HEARTBEAT_BAND` px left of the glyph box and leaves 4px right of it) up to
 * where the label starts, and is 1px taller each side than the plane under it, so neither the band nor the plane shows outside the
 * stroke, whatever the pixel snapping.
 */
const STENCIL_LEFT = GLYPH_LEFT - HEARTBEAT_BAND
const LABEL_START = 32
const STENCIL_WIDTH = LABEL_START - STENCIL_LEFT
const STENCIL_BLEED = 1
const STENCIL_TOP = `calc(50% - ${GLYPH / 2 + STENCIL_BLEED}px)`
const STENCIL_MASK = `mask-image: linear-gradient(#000 0 0), ${heartbeatMasks.trace}; mask-repeat: no-repeat; mask-position: 0 0, ${HEARTBEAT_BAND}px ${STENCIL_BLEED}px; mask-size: 100% 100%, ${GLYPH}px ${GLYPH}px; mask-composite: exclude`

const chipBand = (hosts: string) => each(hosts, (h) => `${h}::before`)
const chipStencil = (hosts: string) => each(hosts, (h) => `${h}::after`)
const chipFlatLine = (hosts: string) => each(hosts, (h) => `${h} > span::before`)
const chipPlane = (hosts: string) => each(hosts, (h) => `${h} > svg`)
const chipLayers = (hosts: string) => `${chipBand(hosts)}, ${chipStencil(hosts)}`
const asTrace = (hosts: string) => `${chipPlane(hosts)} { mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.trace}; }`

/**
 * The capsule of a plugin pill that names one of the two placeholders: its catalog glyph is replaced by the heartbeat. While live
 * the trace is not a mask of its own but a hole: the `svg` is a flat muted plane, `::before` the band over it, and `::after` the
 * stencil (the capsule's own background, `inherit`, with a trace-shaped hole) over both, so the pixel is `(1 - a) capsule + a (muted
 * plus band)` with `a` the trace's coverage: a stencil over a masked trace would multiply the anti-aliased edge by itself and thin
 * the 0.9px stroke. The stencil takes the capsule's hover, pressed and expanded backgrounds with it. The plane and the stencil
 * scale onto the baseline together when the monitor ends.
 */
export const heartbeatChipCss = `${heartbeatSweepKeyframes}
${HOSTS} { position: relative; padding-inline-start: calc(10px + 14px + 8px); }
${each(HOSTS, (h) => `${h}::before, ${h}::after, ${h} > span::before`)} { content: ""; }
${each(HOSTS, (h) => `${h} > svg use`)} { display: none; }
${chipPlane(HOSTS)} { position: absolute; left: ${GLYPH_LEFT}px; top: ${GLYPH_TOP}; width: ${GLYPH}px; height: ${GLYPH}px; margin: 0; display: block; background: ${MUTED}; transform-origin: 0 ${BASELINE}px; transition: ${squash}; pointer-events: none; }
${chipBand(HOSTS)} { ${bandLook}; left: ${GLYPH_LEFT}px; top: ${GLYPH_TOP}; display: none; }
${chipStencil(HOSTS)} { position: absolute; z-index: 2; left: ${STENCIL_LEFT}px; top: ${STENCIL_TOP}; width: ${STENCIL_WIDTH}px; height: ${GLYPH + 2 * STENCIL_BLEED}px; background: inherit; ${STENCIL_MASK}; transform-origin: 0 ${BASELINE + STENCIL_BLEED}px; pointer-events: none; display: none; transition: ${squash}; }
${chipFlatLine(HOSTS)} { position: absolute; left: ${GLYPH_LEFT}px; top: ${GLYPH_TOP}; width: ${GLYPH}px; height: ${GLYPH}px; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.flat}; opacity: 0; transition: opacity ${SETTLE_MS}ms ${EASE}; pointer-events: none; }
${chipBand(LIVE_PILL)} { display: block; ${sweepLoop}; }
${chipStencil(LIVE_PILL)} { display: block; transition: none; }
${chipPlane(FLAT_PILL)} { ${FLATTENED}; display: none; }
${chipStencil(FLAT_PILL)} { ${FLATTENED}; }
${chipFlatLine(FLAT_PILL)} { opacity: 1; }
@supports not (mask-composite: exclude) { ${asTrace(LIVE_PILL)} ${chipLayers(LIVE_PILL)} { display: none; } }
${reducedMedia(`${asTrace(LIVE_PILL)} ${chipLayers(HOSTS)} { display: none; animation: none; } ${chipPlane(HOSTS)}, ${chipFlatLine(HOSTS)} { transition: none; }`)}
${chipLayers(HOSTS).split(", ").map(reduced).join(", ")} { display: none; animation: none; }
${reduced(asTrace(LIVE_PILL))}
${[chipPlane(HOSTS), chipFlatLine(HOSTS)].join(", ").split(", ").map(reduced).join(", ")} { transition: none; }
`

/**
 * Puts every heartbeat on the document timeline's origin so all of them sweep in phase, whenever they mounted. The animation
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
