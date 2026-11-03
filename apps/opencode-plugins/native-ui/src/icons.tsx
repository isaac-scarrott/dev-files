import type { HeartbeatState } from "./heartbeat"

// Icons the host catalog lacks (searched ui/src/icons/catalog.ts), drawn in its 16px style: outline, 1px currentColor
// stroke, round caps and joins, circle r6 as `circle-check` and `info` use. ctx.ui.Icon takes only catalog names, so a
// drawn icon renders inline in a span that inherits the surrounding colour.

const svgAttrs = { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" } as const

export const CLOCK_PATH = "M8 4.5V8l2.5 1.5"

export function ClockIcon() {
  return (
    <span data-slot="drawn-icon" data-icon="clock" aria-hidden="true">
      <svg {...svgAttrs}>
        <circle cx="8" cy="8" r="6" />
        <path d={CLOCK_PATH} />
      </svg>
    </span>
  )
}

const NS = "http://www.w3.org/2000/svg"

/** The same clock for DOM-built UI. */
export function clockIcon(doc: Document): HTMLElement {
  const wrap = doc.createElement("span")
  wrap.dataset.slot = "drawn-icon"
  wrap.dataset.icon = "clock"
  wrap.setAttribute("aria-hidden", "true")
  const svg = doc.createElementNS(NS, "svg")
  for (const [name, value] of Object.entries(svgAttrs)) svg.setAttribute(name, value)
  const face = doc.createElementNS(NS, "circle")
  face.setAttribute("cx", "8")
  face.setAttribute("cy", "8")
  face.setAttribute("r", "6")
  const hands = doc.createElementNS(NS, "path")
  hands.setAttribute("d", CLOCK_PATH)
  svg.append(face, hands)
  wrap.append(svg)
  return wrap
}

export const drawnIconCss = `[data-slot=drawn-icon] { display: inline-flex; flex: none; width: 16px; height: 16px; align-items: center; justify-content: center; color: currentColor; }`

/** A robot in the same outline style as `clock`: rounded-square head, antenna, two eyes, ear nubs. Drawn for the peer message row, the catalog has no agent glyph. */
export function RobotIcon() {
  return (
    <span data-slot="drawn-icon" data-icon="robot" aria-hidden="true">
      <svg {...svgAttrs}>
        <rect x="3" y="4.5" width="10" height="8.5" rx="2.5" />
        <path d="M8 4.5V2.5M1.5 7.5v3M14.5 7.5v3M6 8.5v1.2M10 8.5v1.2" />
      </svg>
    </span>
  )
}

/**
 * An ECG trace, the monitors' glyph (heartbeat.ts). `live` beats, `still` shows the trace at rest, `flat` is the line a monitor ends
 * on; a change of state animates, and a flat icon draws nothing animated. Needs `heartbeatIconCss` in the document (`laneChipCss` and
 * `nativeUiCss` include it).
 */
export function HeartbeatIcon(props: { state: HeartbeatState }) {
  return <span data-slot="drawn-icon" data-icon="heartbeat" data-state={props.state} aria-hidden="true" />
}
