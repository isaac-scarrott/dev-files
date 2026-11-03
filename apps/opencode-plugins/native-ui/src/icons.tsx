import type { HeartbeatState } from "./heartbeat"

// Icons the host catalog lacks (searched ui/src/icons/catalog.ts), drawn in its 16px style: outline, 1px currentColor
// stroke, round caps and joins, circle r6 as `circle-check` and `info` use. ctx.ui.Icon takes only catalog names, so a
// drawn icon renders inline in a span that inherits the surrounding colour.

const svgAttrs = { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" } as const

export const drawnIconCss = `[data-slot=drawn-icon] { display: inline-flex; flex: none; width: 16px; height: 16px; align-items: center; justify-content: center; color: currentColor; }`

/** A robot in the same outline style as the other drawn icons: rounded-square head, antenna, two eyes, ear nubs. Drawn for the peer message row, the catalog has no agent glyph. */
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
 * An ECG trace, the monitors' glyph (heartbeat.ts). `live` sweeps a head of light along the trace, `still` shows the trace at rest,
 * `flat` is the line a monitor ends on; a change of state animates, and a flat icon draws nothing animated. Needs `heartbeatIconCss`
 * in the document (`laneChipCss` and `nativeUiCss` include it).
 */
export function HeartbeatIcon(props: { state: HeartbeatState }) {
  return (
    <span data-slot="drawn-icon" data-icon="heartbeat" data-state={props.state} aria-hidden="true">
      <b>
        <i />
      </b>
      <u />
    </span>
  )
}
