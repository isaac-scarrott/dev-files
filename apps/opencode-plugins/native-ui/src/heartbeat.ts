// The heartbeat: an ECG trace in the host's 16px outline style (1px stroke, round caps and joins, 1.5px of padding), drawn as CSS
// masks so one drawing serves a span (rows, the timeline) and the host's own capsule (`ComposerPill` takes catalog names only, so
// the chip hides the catalog glyph and draws this itself, as it does for the clock).
//
// Two stacked layers, both the same trace: `::before` the dim trace, `::after` a bright copy whose only animation is `opacity`
// (a compositor property: 11 live icons cost ~2.7 ms/s of main-thread time against ~65 ms/s for an SVG animated inside a mask,
// which repaints every frame). Every instance runs the same keyframes and is pinned to the document timeline origin by
// `syncSpinPhase`, so all beat in phase.
//   live   the bright layer flashes with the beat (2s loop): up in 12% of the loop, down by 55%, then rests.
//   still  the dim trace plus a steady bright layer: live under reduced motion, and a running monitor's older wakes.
//   flat   the line a monitor ends on, muted. Going there, both trace layers are squashed to the baseline over 300ms (the trace is
//          centred on y=8) while the flat line grows in.

export const HEARTBEAT_TRACE = "M1.5 8H4.5L6 4.5L8 12L9.75 6.5L10.75 8H14.5"
export const HEARTBEAT_FLAT = "M1.5 8H14.5"

/** Seconds per beat. */
export const HEARTBEAT_LOOP = 2

/** Catalog icons a plugin pill names so the host renders a pill with a glyph we then replace (`laneChipCss`): one per state. */
export const HEARTBEAT_LIVE_PLACEHOLDER = "outline-wave-audio" as const
export const HEARTBEAT_FLAT_PLACEHOLDER = "outline-dots" as const

const SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='#000' stroke-linecap='round' stroke-linejoin='round'>"
const url = (path: string) => `url("data:image/svg+xml,${encodeURIComponent(`${SVG}<path d='${path}'/></svg>`)}")`

export const heartbeatMasks = { trace: url(HEARTBEAT_TRACE), flat: url(HEARTBEAT_FLAT) } as const

export type HeartbeatState = "live" | "still" | "flat"

// An ease-out softer than the host's 0.23,1,0.32,1 (90% in 100ms): the flattening is the point of the motion, so it has to be seen across the 300ms.
const EASE = "cubic-bezier(0.25, 0.7, 0.3, 1)"
const SETTLE_MS = 300
const BEAT = "heartbeat-beat"

interface Target {
  /** The element that owns the two pseudo-elements. */
  host: string
  live: string
  still: string
  flat: string
  size: number
  /** Inline start of the layers inside the host. */
  start: string
  /** Extra declarations for the host (the chip needs a positioning context). */
  hostCss?: string
}

const each = (list: string, wrap: (selector: string) => string) => list.split(", ").map(wrap).join(", ")
const reduced = (list: string) => each(list, (selector) => `:root[data-motion="reduce"] ${selector}`)
const pseudo = (list: string, which: "before" | "after") => each(list, (selector) => `${selector}::${which}`)

const rules = (t: Target) => {
  const both = (list: string) => `${pseudo(list, "before")}, ${pseudo(list, "after")}`
  const layer = `content: ""; position: absolute; inset-block: 0; inset-inline-start: ${t.start}; width: ${t.size}px; height: ${t.size}px; margin: auto 0; background: currentColor; mask-repeat: no-repeat; mask-position: center; mask-image: ${heartbeatMasks.trace}, ${heartbeatMasks.flat}; mask-size: 100% 100%, 100% 0%; transition: mask-size ${SETTLE_MS}ms ${EASE}, color ${SETTLE_MS}ms ${EASE}, opacity ${SETTLE_MS}ms ${EASE}; pointer-events: none;`
  return `
${t.host} { position: relative; color: var(--v2-icon-icon-base); ${t.hostCss ?? ""} }
${both(t.host)} { ${layer} }
${pseudo(t.host, "before")} { opacity: .45; }
${pseudo(t.host, "after")} { opacity: 0; }
${pseudo(t.live, "after")} { animation: ${BEAT} ${HEARTBEAT_LOOP}s infinite; }
${pseudo(t.still, "after")} { opacity: .6; }
${both(t.flat)} { mask-size: 100% 0%, 100% 100%; }
${t.flat} { color: var(--v2-icon-icon-muted); }
${pseudo(t.flat, "before")} { opacity: .8; }
${pseudo(t.flat, "after")} { opacity: 0; animation: none; }
@media (prefers-reduced-motion: reduce) { ${pseudo(t.live, "after")} { animation: none; opacity: .6; } ${both(t.host)} { transition: none; } }
${pseudo(reduced(t.live), "after")} { animation: none; opacity: .6; }
${both(reduced(t.host))} { transition: none; }
`
}

const span = (state: string) => `[data-icon="heartbeat"][data-state="${state}"]`

const PILL = '[data-slot="session-plugin-pill"]'
const pillHas = (icon: string) => `${PILL}:has(use[href$="icon-${icon}"])`

export const heartbeatKeyframes = `@keyframes ${BEAT} { 0% { opacity: 0; animation-timing-function: cubic-bezier(.3,0,.2,1); } 12% { opacity: 1; animation-timing-function: cubic-bezier(.4,0,.2,1); } 55%, 100% { opacity: 0; } }`

/** The span `HeartbeatIcon` renders, in the rows and the timeline. */
export const heartbeatIconCss = `${heartbeatKeyframes}
[data-icon="heartbeat"] { display: inline-block; flex: none; width: 16px; height: 16px; }${rules({ host: '[data-icon="heartbeat"]', live: span("live"), still: span("still"), flat: span("flat"), size: 16, start: "0" })}`

const LIVE_PILL = pillHas(HEARTBEAT_LIVE_PLACEHOLDER)
const FLAT_PILL = pillHas(HEARTBEAT_FLAT_PLACEHOLDER)

/** The capsule of a plugin pill that names one of the two placeholders: its catalog glyph is hidden and the heartbeat is drawn in the same 14px box. */
export const heartbeatChipCss = `
${LIVE_PILL} > svg, ${FLAT_PILL} > svg { display: none; }
${LIVE_PILL}, ${FLAT_PILL} { --heartbeat-slot: 14px; }
${rules({ host: `${LIVE_PILL}, ${FLAT_PILL}`, live: LIVE_PILL, still: `${PILL}:not(*)`, flat: FLAT_PILL, size: 14, start: "10px", hostCss: "padding-inline-start: calc(10px + 14px + 8px);" })}`

/**
 * Puts every heartbeat on the document timeline's origin so all of them beat in phase, whenever they mounted. The animation
 * belongs to a pseudo-element, so it is found through the document and matched by name. Call in `setup`; the listener goes with the owner.
 */
export function syncHeartbeats(doc: Document = document): () => void {
  const pin = () => {
    for (const animation of doc.getAnimations()) {
      if ((animation as CSSAnimation).animationName === BEAT && animation.startTime !== 0) animation.startTime = 0
    }
  }
  doc.addEventListener("animationstart", pin, true)
  pin()
  return () => doc.removeEventListener("animationstart", pin, true)
}
