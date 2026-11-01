import type { ActionName, Handlers, Target } from "./actions"
import { hasNativeArchive } from "./guard"
import { extendNative, isSeparator, type MenuEntry, type MenuLine } from "./menu"

export interface MenuSession { target: Target; disabled: boolean; archived: boolean; subagent: boolean }
// How each surface names its session. The host menus carry no link back to it, so a surface is told apart by its own
// markup (the header menu's class) or by the element the opening event hit (tab, Home row).
export interface Surfaces {
  tab(key: string): MenuSession | undefined
  row(id: string): MenuSession | undefined
  current(): MenuSession | undefined
}

const MENU = '[role="menu"][data-component="menu-v2-content"]'
const ROW = '[data-component="home-session-row-container"]'
const closest = (event: Event, selector: string) => (event.target as Element | null)?.closest?.<HTMLElement>(selector) ?? undefined

// Every host session menu ends with Delete…, alone after a separator (the tab menu's is also marked critical).
// Matching that shape rather than the label keeps it language-independent.
export function hasDelete(content: HTMLElement) {
  const items = content.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-sa-menu])')
  const last = items[items.length - 1]
  if (!last || last.closest("[data-sa-sub]")) return false
  return last.dataset.variant === "critical" || isSeparator(last.previousElementSibling)
}

export function resolveSession(content: HTMLElement, opener: Element | undefined, surfaces: Surfaces): MenuSession | undefined {
  if (content.classList.contains("session-options-menu")) return surfaces.current()
  const tab = opener?.closest<HTMLElement>("[data-tab-key]")?.dataset.tabKey
  if (tab) return surfaces.tab(tab)
  const id = opener?.closest<HTMLElement>(ROW)?.dataset.sessionId
  if (id) return surfaces.row(id)
}

// Adds Snooze… and Archive to every native session menu that has a Delete…, once per open menu, directly above it.
// `archive` says whether our Archive item is wanted; `native` hears, for each session menu looked at, whether the host's own has an Archive item.
export interface MenuHooks { archive?(): boolean; native?(has: boolean): void }
export function createSessionMenus(doc: Document, surfaces: Surfaces, handlers: Handlers, labels: Record<ActionName, string>, snoozeLines: (target: Target) => MenuLine[], hooks: MenuHooks = {}) {
  const undo = new Map<HTMLElement, () => void>()
  let opener: { el?: Element; at: number } | undefined
  const remember = (event: Event) => { opener = { el: event.target as Element, at: Date.now() } }
  // The Home row also opens its menu from the keyboard (ContextMenu, Shift+F10), which fires no contextmenu event here.
  const keyed = (event: KeyboardEvent) => { if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) remember(event) }
  doc.addEventListener("contextmenu", remember, true)
  doc.addEventListener("pointerdown", remember, true)
  doc.addEventListener("keydown", keyed, true)
  const inspect = (content: HTMLElement) => {
    if (content.closest("[data-sa-popup]") || !hasDelete(content)) return
    // A re-render that drops our nodes gets them back; otherwise one open menu is extended once.
    if (undo.has(content)) { if (content.querySelector("[data-sa-menu]")) return; undo.get(content)!(); undo.delete(content) }
    const fresh = opener && Date.now() - opener.at < 2000 ? opener.el : undefined
    const session = resolveSession(content, fresh, surfaces)
    if (!session) return
    const native = hasNativeArchive(content)
    hooks.native?.(native)
    if (session.archived) return
    const lines: MenuEntry[] = []
    if (!session.subagent) lines.push({ label: "Snooze", disabled: session.disabled, submenu: () => snoozeLines(session.target), run() {} })
    if (!native && (hooks.archive?.() ?? true)) lines.push({ label: labels.archive, disabled: session.disabled, run: () => handlers.run("archive", session.target) })
    if (lines.length) undo.set(content, extendNative(content, lines))
  }
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>(MENU).forEach(inspect)
  const observer = new doc.defaultView!.MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue
      const el = node as HTMLElement
      if (el.matches(MENU)) inspect(el)
      else scan(el)
    }
    // Kobalte fills the content after mounting it, so a menu seen empty is looked at again when its items arrive, and one whose items were re-rendered gets ours back.
    for (const record of records) { const menu = (record.target as Element).closest?.<HTMLElement>(MENU); if (menu) inspect(menu) }
    for (const content of undo.keys()) if (!content.isConnected) undo.delete(content)
  })
  observer.observe(doc.body, { childList: true, subtree: true })
  scan(doc)
  return {
    dispose() {
      doc.removeEventListener("contextmenu", remember, true)
      doc.removeEventListener("pointerdown", remember, true)
      doc.removeEventListener("keydown", keyed, true)
      observer.disconnect()
      for (const off of undo.values()) off()
      undo.clear()
    },
  }
}
