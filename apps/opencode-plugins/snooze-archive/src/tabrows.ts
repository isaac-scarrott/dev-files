import { createActions, type Handlers, type Target } from "./actions"
import type { Host } from "./host"

export interface TabInfo { target: Target; title: string; disabled: boolean }

// Adds a hover/focus action cluster beside each vertical session tab. It is a sibling of the host's link,
// so the title, rename, close button and status marks are untouched.
export function createTabActions(doc: Document, shell: Host, schedule: (fn: () => void) => number, cancel: (id: number) => void, info: (key: string) => TabInfo | undefined, handlers: Handlers) {
  const hosts = new Map<HTMLElement, ReturnType<typeof createActions>>()
  const drop = (actions: ReturnType<typeof createActions>) => { actions.dispose(); actions.el.remove() }
  const sync = () => {
    const live = new Set<HTMLElement>()
    for (const host of doc.querySelectorAll<HTMLElement>('[data-slot="vertical-tabs"] [data-tab-key]')) {
      const key = host.dataset.tabKey
      const tab = key ? info(key) : undefined
      let actions = hosts.get(host)
      if (!tab) { if (actions) { drop(actions); host.removeAttribute("data-sa-tab-host"); hosts.delete(host) } continue }
      live.add(host)
      if (!actions || actions.el.parentElement !== host) {
        if (actions) drop(actions)
        actions = createActions(doc, shell, "tab", () => info(key!)?.target, () => info(key!)?.title ?? "", handlers, () => info(key!)?.disabled ?? true)
        hosts.set(host, actions)
        host.append(actions.el)
      }
      host.setAttribute("data-sa-tab-host", "")
    }
    for (const [host, actions] of hosts) if (!live.has(host)) { drop(actions); host.removeAttribute("data-sa-tab-host"); hosts.delete(host) }
  }
  let frame: number | undefined
  const queue = () => { if (frame === undefined) frame = schedule(() => { frame = undefined; sync() }) }
  const observer = new doc.defaultView!.MutationObserver((records) => {
    if (records.some((r) => !(r.target as Element).closest?.("[data-sa-actions]") && (r.type === "attributes" || [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && !(n as Element).matches("[data-sa-actions]"))))) queue()
  })
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tab-key", "data-slot"] })
  sync()
  return {
    sync,
    dispose() {
      observer.disconnect()
      if (frame !== undefined) cancel(frame)
      for (const [host, actions] of hosts) { drop(actions); host.removeAttribute("data-sa-tab-host") }
      hosts.clear()
    },
  }
}
