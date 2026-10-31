// The app's context menu is Kobalte's, rendered with `menu-v2-*` markup. The plugin API cannot open a menu at a
// point, so these helpers write the same markup: into the native tab menu (extendNative) and into a popup of
// our own for rows the app has no menu for (openMenu).
export interface MenuEntry { label: string; hint?: string; danger?: boolean; disabled?: boolean; submenu?: () => MenuLine[]; run(): void }
export type MenuLine = MenuEntry | "separator"

const ITEM = '[role="menuitem"]:not([aria-disabled="true"])'
const SUB = "data-sa-sub"
// Same glyph as the app's submenu trigger (menu-v2-item-chevron).
const CHEVRON = '<svg data-slot="menu-v2-item-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4L10 8L6 12V4Z" fill="currentColor"/></svg>'
const OWN = "data-sa-menu"

interface Sub { open(focus: boolean): void; close(): void }
function itemNode(doc: Document, entry: MenuEntry, appearance: string, choose: (entry: MenuEntry) => void, sub?: Sub) {
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
  if (sub) {
    el.setAttribute("aria-haspopup", "true")
    el.setAttribute("aria-expanded", "false")
    el.insertAdjacentHTML("beforeend", CHEVRON)
  }
  el.onclick = (event) => { event.preventDefault(); event.stopPropagation(); if (entry.disabled) return; if (sub) sub.open(false); else choose(entry) }
  let hover: ReturnType<typeof setTimeout> | undefined
  el.onpointerenter = () => {
    if (entry.disabled) return
    focusItem(el)
    if (sub) hover = setTimeout(() => sub.open(false), 100)
  }
  el.onpointerleave = () => clearTimeout(hover)
  el.onkeydown = (event) => {
    const open = sub && (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ")
    if (!open && event.key !== "Enter" && event.key !== " ") return
    event.preventDefault(); event.stopPropagation()
    if (entry.disabled) return
    if (sub) sub.open(true); else choose(entry)
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

// A submenu opens beside its trigger, inside the parent menu's element so the app's outside-click and focus-out
// checks treat it as part of that menu. Left/Escape close only the submenu.
function subOf(doc: Document, parent: HTMLElement, trigger: () => HTMLElement, entry: MenuEntry, appearance: string, choose: (entry: MenuEntry) => void): Sub {
  let el: HTMLElement | undefined
  const close = () => { el?.remove(); el = undefined; trigger().setAttribute("aria-expanded", "false") }
  const open = (focus: boolean) => {
    if (el?.isConnected) { if (focus) first()?.focus(); return }
    const t = trigger()
    el = doc.createElement("div")
    el.setAttribute("role", "menu")
    el.setAttribute("aria-label", entry.label)
    el.tabIndex = -1
    el.dataset.component = "menu-v2-content"
    el.dataset.appearance = appearance
    el.setAttribute(OWN, ""); el.setAttribute(SUB, "")
    el.style.cssText = `position:absolute;top:${t.offsetTop - 2}px;left:calc(100% + 2px);z-index:1;min-width:160px`
    el.append(...build(doc, entry.submenu!(), appearance, choose))
    el.onkeydown = (event) => {
      if (event.key === "ArrowLeft" || event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); focusItem(t); setTimeout(() => { if (t.isConnected) focusItem(t) }, 0); return }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      const items = [...el!.querySelectorAll<HTMLElement>(ITEM)]
      const target = nextItem(items, (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]') ?? undefined, event.key)
      if (target) focusItem(target)
    }
    parent.append(el)
    t.setAttribute("aria-expanded", "true")
    // No room on the right: open to the left, as the app's submenus flip.
    const win = doc.defaultView!
    if (el.getBoundingClientRect().right > win.innerWidth - 8) { el.style.left = "auto"; el.style.right = "calc(100% + 2px)" }
    if (focus) first()?.focus()
  }
  const first = () => el?.querySelector<HTMLElement>(ITEM) ?? undefined
  return { open, close }
}

const build = (doc: Document, lines: MenuLine[], appearance: string, choose: (entry: MenuEntry) => void, parent?: HTMLElement): HTMLElement[] =>
  lines.map((line) => {
    if (line === "separator") return separatorNode(doc, appearance)
    let node: HTMLElement
    const sub = line.submenu && parent ? subOf(doc, parent, () => node, line, appearance, choose) : undefined
    node = itemNode(doc, line, appearance, choose, sub)
    return node
  })

// Adds our lines to a native menu without replacing it. Items sit before the native destructive group, which the
// app separates with its own separator. Kobalte keeps a collection of its own items, so arrow keys that would step
// onto or off our items are handled here; every other key still reaches the app's handler.
export function extendNative(content: HTMLElement, lines: MenuLine[]): () => void {
  if (content.querySelector(`[${OWN}]`)) return () => {}
  const doc = content.ownerDocument
  const appearance = content.dataset.appearance ?? "compact"
  const close = () => content.dispatchEvent(new (doc.defaultView as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  const nodes = build(doc, lines, appearance, (entry) => { close(); setTimeout(entry.run, 0) }, content)
  const anchor = content.querySelector('[data-slot="menu-v2-separator"]')
  if (anchor) anchor.before(...nodes)
  else content.append(separatorNode(doc, appearance), ...nodes)
  const onKey = (event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    if ((event.target as HTMLElement).closest?.(`[${SUB}]`)) return
    const items = [...content.querySelectorAll<HTMLElement>(ITEM)].filter((el) => !el.closest(`[${SUB}]`))
    const current = (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]') ?? undefined
    const target = nextItem(items, current, event.key)
    const own = (el: HTMLElement | undefined) => !!el?.hasAttribute(OWN)
    if (!target || (!own(current) && !own(target))) return
    event.preventDefault(); event.stopPropagation()
    focusItem(target)
  }
  content.addEventListener("keydown", onKey, true)
  const closeSubs = () => content.querySelectorAll<HTMLElement>(`[${SUB}]`).forEach((sub) => { sub.remove(); content.querySelector('[aria-expanded="true"][aria-haspopup]')?.setAttribute("aria-expanded", "false") })
  // Moving to any item outside the submenu and its trigger closes it.
  const onOver = (event: Event) => {
    const item = (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]')
    if (item && !item.closest(`[${SUB}]`) && !item.hasAttribute("aria-haspopup")) closeSubs()
  }
  content.addEventListener("pointerover", onOver)
  return () => {
    content.removeEventListener("pointerover", onOver)
    content.removeEventListener("keydown", onKey, true)
    content.querySelectorAll(`[${OWN}]`).forEach((el) => el.remove())
  }
}

export interface Point { x: number; y: number }

export function openMenu(doc: Document, at: Point, lines: MenuLine[], options: { label: string; onClose?: (chosen: boolean) => void; focus?: "first" | "none"; restore?: () => HTMLElement | null | undefined }) {
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
  const close = (chosen = false) => {
    if (closed) return
    closed = true
    doc.removeEventListener("pointerdown", outside, true)
    win.removeEventListener("blur", blur)
    win.removeEventListener("resize", blur)
    wrap.remove()
    // The palette that opened us is gone by now, so fall back to the element the menu belongs to.
    const back = previous?.isConnected && previous !== doc.body ? previous : options.restore?.()
    back?.focus({ preventScroll: true })
    options.onClose?.(chosen)
  }
  const blur = () => close()
  const outside = (event: Event) => { if (!wrap.contains(event.target as Node)) close() }
  content.append(...build(doc, lines, "compact", (entry) => { close(true); setTimeout(entry.run, 0) }))
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
  win.addEventListener("blur", blur)
  win.addEventListener("resize", blur)
  if (options.focus !== "none") {
    const first = content.querySelector<HTMLElement>(ITEM)
    if (first) focusItem(first); else content.focus()
  }
  return { close, el: content }
}

export const menuCss = `
[data-sa-popup] { position: fixed; z-index: 100; }
`
