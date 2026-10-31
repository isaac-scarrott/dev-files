// The host catalog has no clock (searched IconName and ui/src/icons/catalog.ts). Drawn in the catalog's 16px style:
// outline, 1px currentColor stroke, round caps and joins, circle r6 as `circle-check` and `info` use. ctx.ui.Icon and
// IconButton only take catalog names, so this renders inline in a span that inherits the surrounding text colour.
const NS = "http://www.w3.org/2000/svg"

export function clockIcon(doc: Document): HTMLElement {
  const wrap = doc.createElement("span")
  wrap.dataset.saIcon = "clock"
  wrap.setAttribute("aria-hidden", "true")
  const svg = doc.createElementNS(NS, "svg")
  for (const [name, value] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(name, value)
  const face = doc.createElementNS(NS, "circle")
  face.setAttribute("cx", "8"); face.setAttribute("cy", "8"); face.setAttribute("r", "6")
  const hands = doc.createElementNS(NS, "path")
  hands.setAttribute("d", "M8 4.5V8l2.5 1.5")
  svg.append(face, hands)
  wrap.append(svg)
  return wrap
}

export const iconCss = `[data-sa-icon] { display: inline-flex; flex: none; width: 16px; height: 16px; align-items: center; justify-content: center; color: currentColor; }`
