import type { ActionName, Handlers, Target } from "./actions"
import { extendNative, type MenuLine } from "./menu"

export interface MenuTab { target: Target; disabled: boolean }

// The app's tab context menu (Rename, Close tab, Delete session…) is a portal on <body> with no link back to its tab
// (live 2.2.5: no aria-labelledby), so the tab is the target of the contextmenu event that opened it. Each time one opens
// for a session tab, our lines are added. Delete is already native, so only Snooze… and Archive go in.
export function createTabMenu(doc: Document, info: (key: string) => MenuTab | undefined, handlers: Handlers, labels: Record<ActionName, string>) {
  const undo = new Map<HTMLElement, () => void>()
  let opener: { key?: string; at: number } | undefined
  const remember = (event: Event) => { opener = { key: (event.target as Element | null)?.closest?.<HTMLElement>("[data-tab-key]")?.dataset.tabKey, at: Date.now() } }
  doc.addEventListener("contextmenu", remember, true)
  const inspect = (content: HTMLElement) => {
    if (undo.has(content)) return
    const key = opener && Date.now() - opener.at < 2000 ? opener.key : undefined
    const tab = key ? info(key) : undefined
    if (!tab) return
    const line = (action: "snooze" | "archive"): MenuLine => ({ label: labels[action], disabled: tab.disabled, run: () => handlers.run(action, tab.target) })
    undo.set(content, extendNative(content, [line("snooze"), line("archive")]))
  }
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>('[role="menu"][data-component="menu-v2-content"]').forEach(inspect)
  const observer = new doc.defaultView!.MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue
      const el = node as HTMLElement
      if (el.matches('[role="menu"][data-component="menu-v2-content"]')) inspect(el)
      else scan(el)
    }
    for (const content of undo.keys()) if (!content.isConnected) undo.delete(content)
  })
  observer.observe(doc.body, { childList: true, subtree: true })
  scan(doc)
  return {
    dispose() {
      doc.removeEventListener("contextmenu", remember, true)
      observer.disconnect()
      for (const off of undo.values()) off()
      undo.clear()
    },
  }
}
