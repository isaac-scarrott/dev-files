import type { Target } from "./actions"

export const WOKE_LABEL = "Woke from snooze"
// Entries are only inert keys; the cap bounds a store that a deleted-while-closed session can never prune.
const MAX_WOKE = 200

export const isWoke = (list: readonly Target[], server: string, id: string) => list.some((item) => item.server === server && item.id === id)
export const withWoke = (list: readonly Target[], server: string, id: string): Target[] =>
  [...list.filter((item) => item.server !== server || item.id !== id), { server, id }].slice(-MAX_WOKE)
export const withoutWoke = (list: readonly Target[], server: string, id: string): Target[] =>
  list.filter((item) => item.server !== server || item.id !== id)

// A woken session shows the clock in the trailing status slot of its vertical tab, ahead of the busy ring and the unread
// dot. A pending approval or question (`data-status="attention"`) still wins: it needs an answer, the clock only a look.
// The mark is a sibling of the host's `tab-status` (which is aria-hidden) so it can carry a label; positioning, the
// hover swap for the close button and the title fade are copied from the host's own rules. The orange is the host's
// `--v2-orange-800`; the title fade comes from the sidebar-repos link mask, which lists `data-sa-woke`.
const NS = "http://www.w3.org/2000/svg"

function markNode(doc: Document) {
  const mark = doc.createElement("span")
  mark.dataset.saWokeMark = ""
  mark.setAttribute("role", "img")
  mark.setAttribute("aria-label", WOKE_LABEL)
  const svg = doc.createElementNS(NS, "svg")
  for (const [name, value] of Object.entries({ viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(name, value)
  const face = doc.createElementNS(NS, "circle")
  face.setAttribute("cx", "8"); face.setAttribute("cy", "8"); face.setAttribute("r", "6")
  const hands = doc.createElementNS(NS, "path")
  hands.setAttribute("d", "M8 4.5V8l2.5 1.5")
  svg.append(face, hands)
  mark.append(svg)
  return mark
}

export function createWokeMarks(doc: Document, schedule: (fn: () => void) => number, cancel: (id: number) => void, target: (key: string) => Target | undefined, woke: (target: Target) => boolean) {
  const marked = new Set<HTMLElement>()
  const clear = (tab: HTMLElement) => {
    tab.removeAttribute("data-sa-woke")
    tab.querySelector("[data-sa-woke-mark]")?.remove()
    marked.delete(tab)
  }
  const sync = () => {
    const live = new Set<HTMLElement>()
    for (const host of doc.querySelectorAll<HTMLElement>('[data-slot="vertical-tabs"] [data-tab-key]')) {
      const key = host.dataset.tabKey
      const session = key ? target(key) : undefined
      const tab = host.querySelector<HTMLElement>("[data-titlebar-tab]")
      const close = tab?.querySelector<HTMLElement>('[data-slot="tab-close"]')
      if (!tab || !close || !session || !woke(session)) continue
      live.add(tab)
      if (!close.querySelector("[data-sa-woke-mark]")) close.querySelector('[data-slot="tab-status"]')?.after(markNode(doc))
      if (!tab.hasAttribute("data-sa-woke")) tab.setAttribute("data-sa-woke", "")
      marked.add(tab)
    }
    for (const tab of marked) if (!live.has(tab)) clear(tab)
  }
  let frame: number | undefined
  const queue = () => { if (frame === undefined) frame = schedule(() => { frame = undefined; sync() }) }
  const observer = new doc.defaultView!.MutationObserver((records) => {
    if (records.some((r) => !(r.target as Element).closest?.("[data-sa-woke-mark]") && (r.type === "attributes" || [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && !(n as Element).matches("[data-sa-woke-mark]"))))) queue()
  })
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tab-key"] })
  sync()
  return {
    sync,
    dispose() {
      observer.disconnect()
      if (frame !== undefined) cancel(frame)
      for (const tab of [...marked]) clear(tab)
    },
  }
}

export const wokeCss = `
[data-titlebar-tab] [data-sa-woke-mark] { position: absolute; inset-block: 0; inset-inline-end: 0; display: none; place-items: center; width: 20px; height: 20px; margin-block: auto; pointer-events: none; color: var(--v2-orange-800); }
[data-titlebar-tab][data-sa-woke]:not([data-status="attention"], [data-active="true"]) [data-sa-woke-mark] { display: grid; }
[data-titlebar-tab][data-sa-woke]:not([data-status="attention"], [data-active="true"]) [data-slot="tab-status"] { display: none; }
[data-titlebar-tab]:is(:hover, :has(:focus-visible)) [data-sa-woke-mark] { opacity: 0; }
`
