// The heartbeat: an ECG trace in the host's 16px outline style (0.9px stroke, round caps and joins, 1.5px of padding, the ink spanning the same 2 to 14 as the clock's circle), drawn as CSS
// masks over a flat colour so one drawing serves a span (rows, the timeline) and the host's own capsule (`ComposerPill` takes
// catalog names only, so the chip hides the catalog glyph and draws this itself, as it does for the clock).
//
// Both renderings are compositor-only (an animated mask repaints on the main thread, a clip-path window re-rasterises every
// frame on the GPU: measured, see native-ui DESIGN). Every instance runs the same keyframes and is pinned to the document timeline
// origin by `syncHeartbeats`, so all beat in phase.
//   rows   (`HeartbeatIcon`, popover rows and timeline) a span masked by the trace and painted in the muted token, holding one child:
//          a 7px band, clear at the tail and the base token at the head, that slides across by `transform` (a quick beat in the first
//          40% of a 2s loop, then rest). The mask clips the band to the trace.
//   chip   (the host's capsule: no child can be added, but it already holds the catalog `svg` and has two pseudo-elements) three
//          layers, each the trace cut to one third (`::before` the lead-in, the `svg` the spike, `::after` the tail), each in the base
//          token. Resting they sit at `REST` opacity, which reads as the muted token; each rises to full and falls back in turn, so
//          a bright patch runs along the trace and leaves a fading trail. Opacity is the only thing that animates.
//   flat   the line a monitor ends on, muted. Going there, the trace is squashed to the baseline over 300ms (it is centred on y=8)
//          while the flat line grows in.

export const HEARTBEAT_TRACE = "M2 8H6L7 2L8.5 14L9.5 8H14"
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

/**
 * The chip's three layers cut the 16-unit drawing at x = 10/1.75 and 17/1.75, which land on whole device pixels in the 14px slot at
 * 2x (1.75 device px per unit), so neighbouring layers share no pixel and the join shows no seam. The spike is inside the middle one.
 */
export const HEARTBEAT_CUTS = [0, 5.714, 9.714, 16] as const
const LAYERS = ["lead", "spike", "tail"] as const
type Layer = (typeof LAYERS)[number]
const slice = (d: string, index: number) => {
  const from = index === 0 ? -1 : HEARTBEAT_CUTS[index]!
  const to = index === LAYERS.length - 1 ? 17 : HEARTBEAT_CUTS[index + 1]!
  return `<clipPath id='c'><rect x='${from}' y='0' width='${to - from}' height='16'/></clipPath><g clip-path='url(#c)'>${path(d)}</g>`
}
const layerMask = (layer: Layer) => `${url(slice(HEARTBEAT_TRACE, LAYERS.indexOf(layer)))}, ${url(slice(HEARTBEAT_FLAT, LAYERS.indexOf(layer)))}`

export const heartbeatMasks = { trace: url(path(HEARTBEAT_TRACE)), flat: url(path(HEARTBEAT_FLAT)) } as const

export type HeartbeatState = "live" | "still" | "flat"

// An ease-out softer than the host's 0.23,1,0.32,1 (90% in 100ms): the flattening is the point of the motion, so it has to be seen across the 300ms.
const EASE = "cubic-bezier(0.25, 0.7, 0.3, 1)"
const SETTLE_MS = 300
const SWEEP = "heartbeat-sweep"
const beat = (layer: Layer) => `heartbeat-beat-${layer}`
export const HEARTBEAT_ANIMATIONS: readonly string[] = [SWEEP, ...LAYERS.map(beat)]

/** Resting opacity of a chip layer: the base token at this opacity over the chip's background reads as the muted token in both themes. */
const REST = 0.54
const BAND = 7

const BASE = "var(--v2-icon-icon-base)"
const MUTED = "var(--v2-icon-icon-muted)"

const PILL = '[data-slot="session-plugin-pill"]'
const pillHas = (icon: string) => `${PILL}:has(use[href$="icon-${icon}"])`
const LIVE_PILL = pillHas(HEARTBEAT_LIVE_PLACEHOLDER)
const FLAT_PILL = pillHas(HEARTBEAT_FLAT_PLACEHOLDER)

const ROW = '[data-icon="heartbeat"]'
const span = (state: string) => `${ROW}[data-state="${state}"]`

export const heartbeatSweepKeyframes = `@keyframes ${SWEEP} { 0% { transform: translateX(-${BAND}px); animation-timing-function: cubic-bezier(.3,0,.25,1); } 40%, 100% { transform: translateX(16px); } }`

// Each layer rises quickly and falls slowly, a layer after the one before it: peaks at 5%, 12% and 19% of the loop (100, 240 and 380ms), where the row band is over the same third.
const pulse = (layer: Layer, start: number, peak: number, end: number) =>
  `@keyframes ${beat(layer)} { ${start > 0 ? `0%, ${start}%` : "0%"} { opacity: ${REST}; animation-timing-function: cubic-bezier(.3,0,.2,1); } ${peak}% { opacity: 1; animation-timing-function: cubic-bezier(.3,0,.4,1); } ${end}%, 100% { opacity: ${REST}; } }`
export const heartbeatKeyframes = [pulse("lead", 0, 5, 24), pulse("spike", 5, 12, 32), pulse("tail", 12, 19, 40)].join("\n")

const REDUCED = ':root[data-motion="reduce"]'
const each = (list: string, wrap: (selector: string) => string) => list.split(", ").map(wrap).join(", ")
const reduced = (selector: string) => `${REDUCED} ${selector}`
const reducedMedia = (css: string) => `@media (prefers-reduced-motion: reduce) { ${css} }`

/** The span `HeartbeatIcon` renders, in the rows and the timeline: masked by the trace, with a band that sweeps across it while live. */
export const heartbeatIconCss = `${heartbeatSweepKeyframes}
${ROW} { display: inline-block; flex: none; position: relative; overflow: hidden; width: 16px; height: 16px; color: ${BASE}; background: ${MUTED}; mask-repeat: no-repeat; mask-position: center; mask-image: ${heartbeatMasks.trace}, ${heartbeatMasks.flat}; mask-size: 100% 100%, 100% 0%; transition: mask-size ${SETTLE_MS}ms ${EASE}; }
${ROW} > i { display: none; position: absolute; inset-block: 0; inset-inline-start: 0; width: ${BAND}px; background: linear-gradient(90deg, transparent, currentColor 70%); will-change: transform; }
${span("live")} > i { display: block; animation: ${SWEEP} ${HEARTBEAT_LOOP}s infinite; }
${span("flat")} { mask-size: 100% 0%, 100% 100%; }
${reducedMedia(`${span("live")} > i { display: none; } ${ROW} { transition: none; }`)}
${REDUCED} ${span("live")} > i { display: none; }
${REDUCED} ${ROW} { transition: none; }
`

const chipLayer = (selector: string, layer: Layer, live: string) => `${selector} { ${["position: absolute", "inset-block: 0", "inset-inline-start: 10px", "margin: auto 0", "width: 14px", "height: 14px", "display: block", `background: ${BASE}`, `opacity: ${REST}`, "mask-repeat: no-repeat", "mask-position: center", `mask-image: ${layerMask(layer)}`, "mask-size: 100% 100%, 100% 0%", `transition: mask-size ${SETTLE_MS}ms ${EASE}, background-color ${SETTLE_MS}ms ${EASE}`, "pointer-events: none"].join("; ")}; }
${live} { animation: ${beat(layer)} ${HEARTBEAT_LOOP}s infinite; }`

const layerSelectors = (host: string): Record<Layer, string> => ({
  lead: each(host, (h) => `${h}::before`),
  spike: each(host, (h) => `${h} > svg`),
  tail: each(host, (h) => `${h}::after`),
})

const HOSTS = `${LIVE_PILL}, ${FLAT_PILL}`
const layers = layerSelectors(HOSTS)
const liveLayers = layerSelectors(LIVE_PILL)
const flatLayers = layerSelectors(FLAT_PILL)
const everyLayer = LAYERS.map((layer) => layers[layer]).join(", ")
const everyFlat = LAYERS.map((layer) => flatLayers[layer]).join(", ")
const everyLive = LAYERS.map((layer) => liveLayers[layer]).join(", ")

/** The capsule of a plugin pill that names one of the two placeholders: its catalog glyph is replaced by the three layers, in the same 14px box. */
export const heartbeatChipCss = `${heartbeatKeyframes}
${HOSTS} { position: relative; padding-inline-start: calc(10px + 14px + 8px); }
${each(HOSTS, (h) => `${h}::before, ${h}::after`)} { content: ""; }
${each(HOSTS, (h) => `${h} > svg use`)} { display: none; }
${LAYERS.map((layer) => chipLayer(layers[layer], layer, liveLayers[layer])).join("\n")}
${everyFlat} { background: ${MUTED}; opacity: 1; mask-size: 100% 0%, 100% 100%; animation: none; }
${reducedMedia(`${everyLive} { animation: none; } ${everyLayer} { transition: none; }`)}
${each(everyLive, reduced)} { animation: none; }
${each(everyLayer, reduced)} { transition: none; }
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
