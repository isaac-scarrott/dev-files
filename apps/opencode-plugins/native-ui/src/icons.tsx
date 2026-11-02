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

/** A 5x5 grid of 2px squares at fixed opacities: the dithered mark the agent rows use. Filled, so it inherits the surrounding colour. */
const DITHER = [0.05,0.32,0.2,0.55,0.12,0.21,0.31,0.41,0.4,0.41,0.52,0.14,0.24,0.23,0.91,0.24,0.64,0.14,0.71,0.39,0.48,0.45,0.46,0.62,0.74] as const

export function AgentIcon() {
  return (
    <span data-slot="drawn-icon" data-icon="agent" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        {DITHER.map((opacity, index) => (
          <rect x={1 + (index % 5) * 3} y={1 + Math.floor(index / 5) * 3} width="2" height="2" opacity={opacity} />
        ))}
      </svg>
    </span>
  )
}
