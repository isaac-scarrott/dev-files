import { onCleanup } from "solid-js"
import { createActions, labels, type Handlers, type Target } from "./actions"
import type { Host } from "./host"
import { elementsChanged, type DomHub } from "./hub"

export interface TabInfo { target: Target; title: string; disabled: boolean; archived: boolean }

// Mounts Archive into each vertical session tab as a native-ui row action, in place of the X; title, rename and status marks are untouched.
export function createTabActions(hub: DomHub, shell: Host, info: (key: string) => TabInfo | undefined, handlers: Handlers) {
  const drop = (actions: ReturnType<typeof createActions>) => { actions.dispose() }
  const hosts = new Map<HTMLElement, ReturnType<typeof createActions> & { label: string }>()
  onCleanup(() => {
    for (const [host, actions] of hosts) { drop(actions); host.removeAttribute("data-sa-tab-host") }
    hosts.clear()
  })
  const sync = () => {
    const live = new Set<HTMLElement>()
    for (const host of hub.sidebar()?.querySelectorAll<HTMLElement>('[data-slot="vertical-tabs"] [data-tab-key]') ?? []) {
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
  // A row came, went or changed key (attributes are filtered to `data-tab-key` and `data-slot`).
  hub.watch((record) => record.type === "attributes" || elementsChanged(record), sync)
  sync()
  return { sync }
}
