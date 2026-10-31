// The app's context menu is Kobalte's, rendered with `menu-v2-*` markup. The plugin API cannot open a menu at a
// point, so these helpers write the same markup: into the native tab menu (extendNative) and into a popup of
// our own for rows the app has no menu for (openMenu).
export interface MenuEntry { label: string; hint?: string; danger?: boolean; disabled?: boolean; run(): void }
export type MenuLine = MenuEntry | "separator"

const ITEM = '[role="menuitem"]:not([aria-disabled="true"])'
const OWN = "data-sa-menu"

function itemNode(doc: Document, entry: MenuEntry, appearance: string, choose: (entry: MenuEntry) => void) {
  const el = doc.createElement("div")
  el.setAttribute("role", "menuitem")
  el.tabIndex = -1
  el.dataset.component = "menu-v2-item"
  el.dataset.appearance = appearance
  el.setAttribute(OWN, "")
  if (entry.danger) el.dataset.variant = "critical"
  if (entry.disabled) { el.setAttribute("aria-disabled", "true"); el.dataset.disabled = "" }
  const content = doc.createElement("span")
  content.dataset.slot = "menu-v2-item-content"
  content.textContent = entry.label
  el.append(content)
  if (entry.hint) {
    const hint = doc.createElement("span")
    hint.dataset.slot = "menu-v2-item-shortcut"
    hint.textContent = entry.hint
    el.append(hint)
  }
  el.onclick = (event) => { event.preventDefault(); event.stopPropagation(); if (!entry.disabled) choose(entry) }
  el.onpointerenter = () => { if (!entry.disabled) focusItem(el) }
  el.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault(); event.stopPropagation()
    if (!entry.disabled) choose(entry)
  }
  return el
}

const separatorNode = (doc: Document, appearance: string) => {
  const el = doc.createElement("div")
  el.setAttribute("role", "separator")
  el.dataset.slot = "menu-v2-separator"
  el.dataset.appearance = appearance
  el.setAttribute(OWN, "")
  return el
}

// One highlighted item at a time, as Kobalte marks the focused key.
export function focusItem(item: HTMLElement) {
  const menu = item.closest('[role="menu"]')
  menu?.querySelectorAll("[data-highlighted]").forEach((el) => el.removeAttribute("data-highlighted"))
  item.setAttribute("data-highlighted", "")
  item.focus({ preventScroll: true })
}

export function nextItem(items: HTMLElement[], from: HTMLElement | undefined, key: string) {
  if (!items.length) return
  const at = from ? items.indexOf(from) : -1
  if (key === "Home") return items[0]
  if (key === "End") return items.at(-1)
  if (key === "ArrowDown") return items[(at + 1) % items.length]
  return items[(at <= 0 ? items.length : at) - 1]
}

const build = (doc: Document, lines: MenuLine[], appearance: string, choose: (entry: MenuEntry) => void) =>
  lines.map((line) => line === "separator" ? separatorNode(doc, appearance) : itemNode(doc, line, appearance, choose))

// Adds our lines to a native menu without replacing it. Items sit before the native destructive group, which the
// app separates with its own separator. Kobalte keeps a collection of its own items, so arrow keys that would step
// onto or off our items are handled here; every other key still reaches the app's handler.
export function extendNative(content: HTMLElement, lines: MenuLine[]): () => void {
  if (content.querySelector(`[${OWN}]`)) return () => {}
  const doc = content.ownerDocument
  const appearance = content.dataset.appearance ?? "compact"
  const close = () => content.dispatchEvent(new (doc.defaultView as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  const nodes = build(doc, lines, appearance, (entry) => { close(); setTimeout(entry.run, 0) })
  const anchor = content.querySelector('[data-slot="menu-v2-separator"]')
  if (anchor) anchor.before(...nodes)
  else content.append(separatorNode(doc, appearance), ...nodes)
  const onKey = (event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    const items = [...content.querySelectorAll<HTMLElement>(ITEM)]
    const current = (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]') ?? undefined
    const target = nextItem(items, current, event.key)
    const own = (el: HTMLElement | undefined) => !!el?.hasAttribute(OWN)
    if (!target || (!own(current) && !own(target))) return
    event.preventDefault(); event.stopPropagation()
    focusItem(target)
  }
  content.addEventListener("keydown", onKey, true)
  return () => {
    content.removeEventListener("keydown", onKey, true)
    content.querySelectorAll(`[${OWN}]`).forEach((el) => el.remove())
  }
}

export interface Point { x: number; y: number }

export function openMenu(doc: Document, at: Point, lines: MenuLine[], options: { label: string; onClose?: () => void; focus?: "first" | "none" }) {
  const win = doc.defaultView!
  const previous = doc.activeElement as HTMLElement | null
  const wrap = doc.createElement("div")
  wrap.dataset.saPopup = ""
  const content = doc.createElement("div")
  content.setAttribute("role", "menu")
  content.setAttribute("aria-label", options.label)
  content.tabIndex = -1
  content.dataset.component = "menu-v2-content"
  content.dataset.appearance = "compact"
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    doc.removeEventListener("pointerdown", outside, true)
    win.removeEventListener("blur", close)
    win.removeEventListener("resize", close)
    wrap.remove()
    if (previous?.isConnected) previous.focus({ preventScroll: true })
    options.onClose?.()
  }
  const outside = (event: Event) => { if (!wrap.contains(event.target as Node)) close() }
  content.append(...build(doc, lines, "compact", (entry) => { close(); setTimeout(entry.run, 0) }))
  content.onkeydown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key === "Tab") { event.preventDefault(); close(); return }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const items = [...content.querySelectorAll<HTMLElement>(ITEM)]
    const target = nextItem(items, (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]') ?? undefined, event.key)
    if (target) focusItem(target)
  }
  wrap.append(content)
  doc.body.append(wrap)
  const width = content.offsetWidth, height = content.offsetHeight
  wrap.style.left = `${Math.max(4, Math.min(at.x, win.innerWidth - width - 4))}px`
  wrap.style.top = `${Math.max(4, Math.min(at.y, win.innerHeight - height - 4))}px`
  doc.addEventListener("pointerdown", outside, true)
  win.addEventListener("blur", close)
  win.addEventListener("resize", close)
  if (options.focus !== "none") {
    const first = content.querySelector<HTMLElement>(ITEM)
    if (first) focusItem(first); else content.focus()
  }
  return { close, el: content }
}

export const menuCss = `
[data-sa-popup] { position: fixed; z-index: 100; }
`
