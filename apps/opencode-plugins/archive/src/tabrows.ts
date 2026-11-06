import { onCleanup } from "solid-js"
import { attachTabRowAction } from "../../native-ui/src"
import { ARCHIVE_LABEL, elementsChanged, type DomHub, type Host, type Target } from "../../session-ui/src"

export interface TabInfo { target: Target; title: string; disabled: boolean; archived: boolean }

// Archive replaces the app's close X through native-ui's row action in replace mode: the host's own IconButton in a
// slot placed and revealed like the X, with the X hidden.
function attach(host: Host, row: HTMLElement, label: string, onClick: () => void) {
  const dispose = attachTabRowAction(row, host, { icon: "archive", replace: true, label, onClick })
  row.querySelector<HTMLElement>(":scope > [data-slot=tab-row-action]")?.setAttribute("data-sa-actions", "tab")
  return { tab: row, label, dispose }
}

// Mounts Archive into each vertical session tab, in place of the X; title, rename and status marks are untouched.
export function createTabActions(hub: DomHub, host: Host, info: (key: string) => TabInfo | undefined, onClick: (target: Target) => void) {
  const hosts = new Map<HTMLElement, ReturnType<typeof attach>>()
  onCleanup(() => {
    for (const [tab, actions] of hosts) { actions.dispose(); tab.removeAttribute("data-sa-tab-host") }
    hosts.clear()
  })
  const sync = () => {
    const live = new Set<HTMLElement>()
    for (const tab of hub.sidebar()?.querySelectorAll<HTMLElement>('[data-slot="vertical-tabs"] [data-tab-key]') ?? []) {
      const key = tab.dataset.tabKey
      const session = key ? info(key) : undefined
      let actions = hosts.get(tab)
      if (!session) { if (actions) { actions.dispose(); tab.removeAttribute("data-sa-tab-host"); hosts.delete(tab) } continue }
      live.add(tab)
      tab.toggleAttribute("data-sa-archived-tab", session.archived)
      const row = tab.querySelector<HTMLElement>("[data-titlebar-tab]") ?? tab
      const label = `${ARCHIVE_LABEL} ${session.title}`.trim()
      // A session that cannot be archived yet (pending) shows no button; a rename or a rebuilt row re-attaches it.
      if (actions && (session.disabled || actions.tab !== row || actions.label !== label)) { actions.dispose(); hosts.delete(tab); actions = undefined }
      if (!actions && !session.disabled) {
        actions = attach(host, row, label, () => { const target = info(key!)?.target; if (target) onClick(target) })
        hosts.set(tab, actions)
      }
      tab.toggleAttribute("data-sa-tab-host", !!actions)
    }
    for (const [tab, actions] of hosts) if (!live.has(tab)) { actions.dispose(); tab.removeAttribute("data-sa-tab-host"); hosts.delete(tab) }
  }
  // A row came, went or changed key (attributes are filtered to `data-tab-key` and `data-slot`).
  hub.watch((record) => record.type === "attributes" || elementsChanged(record), sync)
  sync()
  return { sync }
}

export const actionsCss = `
[data-sa-archived-tab] { display: none; }
`
