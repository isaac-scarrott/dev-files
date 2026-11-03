// The heartbeat: an ECG trace in the host's outline style (0.9px stroke, round caps and joins), a classic P-QRS-T drawn as a CSS mask
// over a flat muted colour. While a monitor is live a soft band of light glides along the stroke, the way the host's own text shimmer
// and compaction glint brighten what is already there: only the stroke lights up, nothing sits on top of it, the outline never changes.
//
// Compositor only. The band is a 7px-wide gradient box moved by `transform: translateX()` and faded by `opacity`; the masks and
// clip-paths the earlier versions animated repaint or re-rasterise every frame (measured, see native-ui DESIGN). Every instance runs
// the same keyframes, pinned to the document timeline origin by `syncHeartbeats`, so all glint in phase.
//   rows   (`HeartbeatIcon`, popover rows and timeline) a 16px span: `<b>` is the trace (a mask over the muted colour) and holds the
//          band `<i>`, which the mask clips to the stroke; `<u>` is the flat line.
//   chip   (the host's capsule: no child can be added, but it holds the catalog `svg` and its label `span`, and each has two
//          pseudo-elements) the `svg` is the trace, the capsule's `::before` the band, its `::after` a stencil over the band (the
//          capsule's own background, `inherit`, with a trace-shaped hole, so the band shows only through the stroke and follows the
//          capsule's hover, pressed and expanded backgrounds), the label's `::before` the flat line.
//   flat   the line a monitor ends on, muted. The trace is squashed to the baseline over 300ms while the flat line fades in, and
//          the glint fades out over the first 220ms.

/** The trace, in a 16 x 16 box with the baseline at y=8: lead-in, P, flat, Q, R, S, flat, T, tail. */
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

export const HEARTBEAT_TRACE = `M${HEARTBEAT_POINTS.map(([x, y]) => `${x} ${y}`).join("L")}`
export const HEARTBEAT_FLAT = "M2 8H14"

/** Seconds per glint: it crosses the trace, then rests. */
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

/**
 * The glint, in ms on the loop: the band is `width` px wide and moves from `-width` to the box's far edge in `run` ms at constant
 * speed (a monitor's sweep), fading in over `fadeIn` and out over the last `fadeOut`, on the host compaction glint's fall curve.
 */
export const HEARTBEAT_GLINT = { width: 7, run: 1100, fadeIn: 160, fadeOut: 160 } as const
const FALL = "cubic-bezier(0.4, 0, 0.6, 1)"
/** How bright the band gets at its centre: the host's base icon token over the muted trace is 2.9:1 in light, 2.2:1 in dark. */
const BAND_COLOUR = "var(--v2-icon-icon-base)"
const BOX = 16

// An ease-out softer than the host's 0.23,1,0.32,1 (90% in 100ms): the flattening is the point of the motion, so it has to be seen across the 300ms.
const EASE = "cubic-bezier(0.25, 0.7, 0.3, 1)"
const SETTLE_MS = 300
/** y of the trace's baseline in the 16px box, which the settle squashes everything onto. */
const BASELINE = 8
/** The glint fades out this long after a monitor ends; the animated parts leave the render tree (their animations stop) once the squash is over. */
const GONE_MS = 220
const GONE_HOLD_MS = 320

const GLINT = "heartbeat-glint"
const GONE = "heartbeat-gone"
export const HEARTBEAT_ANIMATIONS: readonly string[] = [GLINT]

const pct = (ms: number) => `${+((ms / (HEARTBEAT_LOOP * 1000)) * 100).toFixed(3)}%`
const { width: BAND, run: RUN, fadeIn: IN_MS, fadeOut: OUT_MS } = HEARTBEAT_GLINT

/** The band's one keyframe track: translateX from -width to the far edge at constant speed, opacity in, held, out on the fall curve, rest. */
export const heartbeatGlintKeyframes = `@keyframes ${GLINT} {
  0% { transform: translateX(${-BAND}px); opacity: 0; animation-timing-function: linear; }
  ${pct(IN_MS)} { opacity: 1; animation-timing-function: linear; }
  ${pct(RUN - OUT_MS)} { opacity: 1; animation-timing-function: ${FALL}; }
  ${pct(RUN)}, 100% { transform: translateX(${BOX}px); opacity: 0; }
}`

/** Fades whatever the glint animation shows to nothing: added on top of it, so the band carries on along the stroke while it goes. */
export const heartbeatGoneKeyframes = `@keyframes ${GONE} { from { opacity: 0; } to { opacity: -1; } }`

const REDUCED = ':root[data-motion="reduce"]'
const each = (list: string, wrap: (selector: string) => string) => list.split(", ").map(wrap).join(", ")
const reduced = (selector: string) => `${REDUCED} ${selector}`
const reducedMedia = (css: string) => `@media (prefers-reduced-motion: reduce) { ${css} }`

const MUTED = "var(--v2-icon-icon-muted)"
const BAND_PAINT = `background: linear-gradient(90deg, transparent, ${BAND_COLOUR} 50%, transparent)`

const squash = `scale ${SETTLE_MS}ms ${EASE}, display 0s ${GONE_HOLD_MS}ms allow-discrete`
const FLATTENED = "scale: 1 0"

const bandLook = [
  "position: absolute",
  "z-index: 1",
  "top: 0",
  `width: ${BAND}px`,
  `height: ${BOX}px`,
  BAND_PAINT,
  "opacity: 0",
  `transform: translateX(${-BAND}px)`,
  `transform-origin: 0 ${BASELINE}px`,
  "pointer-events: none",
].join("; ")

const glintLoop = `animation: ${GLINT} ${HEARTBEAT_LOOP}s infinite`
const goneLoop = `animation: ${GLINT} ${HEARTBEAT_LOOP}s infinite, ${GONE} ${GONE_MS}ms ease-out forwards; animation-composition: replace, add`

const ROW = '[data-icon="heartbeat"]'
const span = (state: string) => `${ROW}[data-state="${state}"]`

/**
 * The span `HeartbeatIcon` renders, in the rows and the timeline: `<b>` the trace (masked, muted) holding `<i>`, the band the mask
 * clips to the stroke (drawn only while live and while ending), `<u>` the flat line.
 */
export const heartbeatIconCss = `${heartbeatGlintKeyframes}
${heartbeatGoneKeyframes}
${ROW} { display: inline-block; flex: none; position: relative; width: ${BOX}px; height: ${BOX}px; }
${ROW} > b { position: absolute; inset: 0; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.trace}; transform-origin: 0 ${BASELINE}px; transition: ${squash}; }
${ROW} > b > i { ${bandLook}; left: 0; display: none; }
${ROW} > u { position: absolute; inset: 0; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.flat}; opacity: 0; transition: opacity ${SETTLE_MS}ms ${EASE}; }
${span("live")} > b > i { display: block; ${glintLoop}; }
${span("flat")} > b { ${FLATTENED}; display: none; }
${span("flat")} > b > i { display: block; ${goneLoop}; }
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
 * The stencil is as wide as the band's whole travel (the band starts and ends `BAND` px outside the glyph box) and 1px taller each
 * side than the plane under it, so neither the band nor the plane shows outside the stroke, whatever the pixel snapping.
 */
const STENCIL_LEFT = GLYPH_LEFT - BAND
const STENCIL_WIDTH = GLYPH + 2 * BAND
const STENCIL_BLEED = 1
const STENCIL_TOP = `calc(50% - ${GLYPH / 2 + STENCIL_BLEED}px)`
const STENCIL_MASK = `mask-image: linear-gradient(#000 0 0), ${heartbeatMasks.trace}; mask-repeat: no-repeat; mask-position: 0 0, ${BAND}px ${STENCIL_BLEED}px; mask-size: 100% 100%, ${GLYPH}px ${GLYPH}px; mask-composite: exclude`

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
 * the 0.9px stroke. The stencil takes the capsule's hover, pressed and expanded backgrounds with it. The three scale onto the baseline together
 * when the monitor ends.
 */
export const heartbeatChipCss = `${heartbeatGlintKeyframes}
${heartbeatGoneKeyframes}
${HOSTS} { position: relative; padding-inline-start: calc(10px + 14px + 8px); }
${each(HOSTS, (h) => `${h}::before, ${h}::after, ${h} > span::before`)} { content: ""; }
${each(HOSTS, (h) => `${h} > svg use`)} { display: none; }
${chipPlane(HOSTS)} { position: absolute; left: ${GLYPH_LEFT}px; top: ${GLYPH_TOP}; width: ${GLYPH}px; height: ${GLYPH}px; margin: 0; display: block; background: ${MUTED}; transform-origin: 0 ${BASELINE}px; transition: ${squash}; pointer-events: none; }
${chipBand(HOSTS)} { ${bandLook}; left: ${GLYPH_LEFT}px; top: ${GLYPH_TOP}; display: none; transition: ${squash}; }
${chipStencil(HOSTS)} { position: absolute; z-index: 2; left: ${STENCIL_LEFT}px; top: ${STENCIL_TOP}; width: ${STENCIL_WIDTH}px; height: ${GLYPH + 2 * STENCIL_BLEED}px; background: inherit; ${STENCIL_MASK}; transform-origin: 0 ${BASELINE + STENCIL_BLEED}px; pointer-events: none; display: none; transition: ${squash}; }
${chipFlatLine(HOSTS)} { position: absolute; left: ${GLYPH_LEFT}px; top: ${GLYPH_TOP}; width: ${GLYPH}px; height: ${GLYPH}px; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-size: 100% 100%; mask-image: ${heartbeatMasks.flat}; opacity: 0; transition: opacity ${SETTLE_MS}ms ${EASE}; pointer-events: none; }
${chipBand(LIVE_PILL)} { display: block; transition: none; ${glintLoop}; }
${chipStencil(LIVE_PILL)} { display: block; transition: none; }
${chipPlane(FLAT_PILL)} { ${FLATTENED}; display: none; }
${chipBand(FLAT_PILL)} { ${FLATTENED}; ${goneLoop}; }
${chipStencil(FLAT_PILL)} { ${FLATTENED}; }
${chipFlatLine(FLAT_PILL)} { opacity: 1; }
@supports not (mask-composite: exclude) { ${asTrace(LIVE_PILL)} ${chipLayers(LIVE_PILL)} { display: none; } }
${reducedMedia(`${asTrace(LIVE_PILL)} ${chipLayers(HOSTS)} { display: none; animation: none; } ${chipPlane(HOSTS)}, ${chipFlatLine(HOSTS)} { transition: none; }`)}
${chipLayers(HOSTS).split(", ").map(reduced).join(", ")} { display: none; animation: none; }
${reduced(asTrace(LIVE_PILL))}
${[chipPlane(HOSTS), chipFlatLine(HOSTS)].join(", ").split(", ").map(reduced).join(", ")} { transition: none; }
`

/**
 * Puts every heartbeat on the document timeline's origin so all of them glint in phase, whenever they mounted. The animation
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
