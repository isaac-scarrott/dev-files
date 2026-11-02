import { createActions, labels, type Handlers, type Target } from "./actions"
import type { Host } from "./host"

export interface TabInfo { target: Target; title: string; disabled: boolean; archived: boolean }

// Mounts Archive into each vertical session tab as a native-ui row action, in place of the X; title, rename and status marks are untouched.
export function createTabActions(doc: Document, shell: Host, schedule: (fn: () => void) => number, cancel: (id: number) => void, info: (key: string) => TabInfo | undefined, handlers: Handlers) {
  const hosts = new Map<HTMLElement, ReturnType<typeof createActions> & { label: string }>()
  const drop = (actions: ReturnType<typeof createActions>) => { actions.dispose() }
  const sync = () => {
    const live = new Set<HTMLElement>()
    for (const host of doc.querySelectorAll<HTMLElement>('[data-slot="vertical-tabs"] [data-tab-key]')) {
      const key = host.dataset.tabKey
      const tab = key ? info(key) : undefined
      let actions = hosts.get(host)
      if (!tab) { if (actions) { drop(actions); host.removeAttribute("data-sa-tab-host"); hosts.delete(host) } continue }
      live.add(host)
      host.toggleAttribute("data-sa-archived-tab", tab.archived)
      const row = host.querySelector<HTMLElement>("[data-titlebar-tab]") ?? host
      const label = `${labels.archive} ${tab.title}`.trim()
      // A session that cannot be archived yet (pending) shows no button; a rename or a rebuilt row re-attaches it.
      if (actions && (tab.disabled || actions.tab !== row || actions.label !== label)) { drop(actions); hosts.delete(host); actions = undefined }
      if (!actions && !tab.disabled) {
        actions = { ...createActions(shell, row, () => info(key!)?.target, label, handlers), label }
        hosts.set(host, actions)
      }
      host.toggleAttribute("data-sa-tab-host", !!actions)
    }
    for (const [host, actions] of hosts) if (!live.has(host)) { drop(actions); host.removeAttribute("data-sa-tab-host"); hosts.delete(host) }
  }
  let frame: number | undefined
  const queue = () => { if (frame === undefined) frame = schedule(() => { frame = undefined; sync() }) }
  // Tab rows only: the session timeline mutates on every scroll and streamed delta and holds none of them.
  const ROWS = "[data-tab-key], [data-titlebar-tab-list], [data-titlebar-tab], [data-slot='vertical-tabs-scroll']"
  const nearRows = (r: MutationRecord) => !!(r.target as Element).closest?.(ROWS) || [...r.addedNodes].some((n) => n.nodeType === 1 && ((n as Element).matches(ROWS) || !!(n as Element).querySelector(ROWS)))
  const observer = new doc.defaultView!.MutationObserver((records) => {
    if (records.some((r) => nearRows(r) && !(r.target as Element).closest?.("[data-sa-actions]") && (r.type === "attributes" || [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && !(n as Element).matches("[data-sa-actions]"))))) queue()
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
