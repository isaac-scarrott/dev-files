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
