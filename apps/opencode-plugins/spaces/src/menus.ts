// Adds "Move to space ▸" to the host's own session menus. The plugin API has no menu registry, so this writes the app's
// `menu-v2` markup into the menu the host opened, above its Delete…, and removes only its own nodes. The technique is the
// one the snooze/archive plugins proved; it is copied here rather than imported, so spaces works on its own.
//
// The app's menu is Kobalte's: it keeps a collection of its own items, so arrow keys that would step onto our items are
// handled here and every other key still reaches the app.

export interface MenuEntry {
  label: string
  hint?: string
  disabled?: boolean
  submenu?: () => MenuLine[]
  run(): void
}
export type MenuLine = MenuEntry | "separator"

export const OWNER = "data-spaces-menu"
const OWNERED = "data-spaces-menu-owner"
const OWN = `[${OWNER}]`
const SUB = "data-spaces-sub"
const ITEM = '[role="menuitem"]:not([aria-disabled="true"])'
const MENU = '[role="menu"][data-component="menu-v2-content"]'
const ROW = "[data-session-id]"
const CHEVRON =
  '<svg data-slot="menu-v2-item-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4L10 8L6 12V4Z" fill="currentColor"/></svg>'
const APPEARANCE = "compact"

export const isSeparator = (el: Element | null) =>
  !!el && (el.getAttribute("role") === "separator" || el.getAttribute("data-slot") === "menu-v2-separator")

/** Every host session menu ends with Delete…, alone after a separator: that shape, not a label, is what marks one. */
export function hasDelete(content: HTMLElement) {
  const items = content.querySelectorAll<HTMLElement>(`[role="menuitem"]:not([${OWNER}])`)
  const last = items[items.length - 1]
  if (!last || last.closest(`[${SUB}]`)) return false
  return last.dataset.variant === "critical" || isSeparator(last.previousElementSibling)
}

function itemNode(doc: Document, entry: MenuEntry, choose: (entry: MenuEntry) => void, sub?: { open(focus: boolean): void }) {
  const el = doc.createElement("div")
  el.setAttribute("role", "menuitem")
  el.tabIndex = -1
  el.dataset.component = "menu-v2-item"
  el.dataset.appearance = APPEARANCE
  el.setAttribute(OWNER, "")
  if (entry.disabled) {
    el.setAttribute("aria-disabled", "true")
    el.dataset.disabled = ""
  }
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
  el.onclick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (entry.disabled) return
    if (sub) sub.open(false)
    else choose(entry)
  }
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
    event.preventDefault()
    event.stopPropagation()
    if (entry.disabled) return
    if (sub) sub.open(true)
    else choose(entry)
  }
  return el
}

const separatorNode = (doc: Document) => {
  const el = doc.createElement("div")
  el.setAttribute("role", "separator")
  el.dataset.slot = "menu-v2-separator"
  el.dataset.appearance = APPEARANCE
  el.setAttribute(OWNER, "")
  return el
}

/** One highlighted item at a time, as the app marks its focused key. */
export function focusItem(item: HTMLElement) {
  const menu = item.closest('[role="menu"]')
  menu?.querySelectorAll("[data-highlighted]").forEach((el) => el.removeAttribute("data-highlighted"))
  item.setAttribute("data-highlighted", "")
  item.focus({ preventScroll: true })
}

export function nextItem(items: HTMLElement[], from: HTMLElement | undefined, key: string) {
  if (!items.length) return undefined
  const at = from ? items.indexOf(from) : -1
  if (key === "Home") return items[0]
  if (key === "End") return items.at(-1)
  if (key === "ArrowDown") return items[(at + 1) % items.length]
  return items[(at <= 0 ? items.length : at) - 1]
}

function submenu(doc: Document, parent: HTMLElement, trigger: () => HTMLElement, entry: MenuEntry & { submenu: () => MenuLine[] }, choose: (entry: MenuEntry) => void) {
  let el: HTMLElement | undefined
  const close = () => {
    el?.remove()
    el = undefined
    trigger().setAttribute("aria-expanded", "false")
  }
  const open = (focus: boolean) => {
    if (el?.isConnected) {
      if (focus) el.querySelector<HTMLElement>(ITEM)?.focus()
      return
    }
    const t = trigger()
    el = doc.createElement("div")
    el.setAttribute("role", "menu")
    el.setAttribute("aria-label", entry.label)
    el.tabIndex = -1
    el.dataset.component = "menu-v2-content"
    el.dataset.appearance = APPEARANCE
    el.setAttribute(OWNER, "")
    el.setAttribute(SUB, "")
    el.style.cssText = `position:absolute;top:${t.offsetTop - 2}px;left:calc(100% + 2px);z-index:1;min-width:160px;width:max-content`
    el.append(...build(doc, entry.submenu(), choose, el))
    el.onkeydown = (event) => {
      if (event.key === "ArrowLeft" || event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        close()
        focusItem(t)
        return
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      const items = [...el!.querySelectorAll<HTMLElement>(ITEM)]
      const target = nextItem(items, (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]') ?? undefined, event.key)
      if (target) focusItem(target)
    }
    parent.append(el)
    t.setAttribute("aria-expanded", "true")
    const win = doc.defaultView!
    if (el.getBoundingClientRect().right > win.innerWidth - 8) {
      el.style.left = "auto"
      el.style.right = "calc(100% + 2px)"
    }
    if (focus) el.querySelector<HTMLElement>(ITEM)?.focus()
  }
  return { open, close }
}

const build = (doc: Document, lines: MenuLine[], choose: (entry: MenuEntry) => void, parent?: HTMLElement): HTMLElement[] =>
  lines.map((line) => {
    if (line === "separator") return separatorNode(doc)
    const sub = line.submenu && parent ? submenu(doc, parent, () => node, line as MenuEntry & { submenu: () => MenuLine[] }, choose) : undefined
    const node: HTMLElement = itemNode(doc, line, choose, sub)
    return node
  })

/** Adds lines above the host's Delete…, without replacing the menu. Returns the undo for this menu. */
export function extendNative(content: HTMLElement, lines: MenuLine[]): () => void {
  if (content.querySelector(OWN)) return () => undefined
  const doc = content.ownerDocument
  const close = () =>
    content.dispatchEvent(new (doc.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  const nodes = build(doc, lines, (entry) => {
    close()
    setTimeout(entry.run, 0)
  }, content)
  const native = [...content.querySelectorAll<HTMLElement>(`[role="menuitem"]:not([${OWNER}])`)].filter((el) => el.parentElement === content)
  const last = native.at(-1)
  const before = isSeparator(last?.previousElementSibling ?? null) ? last!.previousElementSibling : last
  if (before) before.before(...nodes)
  else content.append(...nodes)
  const onKey = (event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    if ((event.target as HTMLElement).closest?.(`[${SUB}]`)) return
    const items = [...content.querySelectorAll<HTMLElement>(ITEM)].filter((el) => !el.closest(`[${SUB}]`))
    const current = (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]') ?? undefined
    const target = nextItem(items, current, event.key)
    const own = (el: HTMLElement | undefined) => !!el?.hasAttribute(OWNER)
    if (!target || (!own(current) && !own(target))) return
    event.preventDefault()
    event.stopPropagation()
    focusItem(target)
  }
  content.addEventListener("keydown", onKey, true)
  const closeSubs = () =>
    content.querySelectorAll<HTMLElement>(`[${SUB}]`).forEach((sub) => {
      sub.remove()
      content.querySelector('[aria-expanded="true"][aria-haspopup]')?.setAttribute("aria-expanded", "false")
    })
  const onOver = (event: Event) => {
    const item = (event.target as HTMLElement).closest?.<HTMLElement>('[role="menuitem"]')
    if (item && !item.closest(`[${SUB}]`) && !item.hasAttribute("aria-haspopup")) closeSubs()
  }
  content.addEventListener("pointerover", onOver)
  return () => {
    content.removeEventListener("pointerover", onOver)
    content.removeEventListener("keydown", onKey, true)
    content.querySelectorAll(OWN).forEach((el) => el.remove())
  }
}

export interface MenuSession {
  server: string
  id: string
}

/**
 * Watches for the host's session menus and extends each with the lines `read()` returns. A session is read from the
 * element the opening event hit: a tab row, a Home row, else the header's own "session options" menu.
 */
export interface MenuResolve {
  tab(key: string): MenuSession | undefined
  row(id: string): MenuSession | undefined
  current(): MenuSession | undefined
}

export function createSpaceMenus(doc: Document, read: (session: MenuSession) => MenuLine[], resolve: MenuResolve) {
  const undo = new Map<HTMLElement, () => void>()
  let opener: { el?: Element; at: number } | undefined
  const remember = (event: Event) => {
    opener = { el: event.target as Element, at: Date.now() }
  }
  const keyed = (event: KeyboardEvent) => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) remember(event)
  }
  doc.addEventListener("contextmenu", remember, true)
  doc.addEventListener("pointerdown", remember, true)
  doc.addEventListener("keydown", keyed, true)

  const sessionOf = (content: HTMLElement): MenuSession | undefined => {
    if (content.classList.contains("session-options-menu")) return resolve.current()
    const fresh = opener && Date.now() - opener.at < 2000 ? opener.el : undefined
    const tab = fresh?.closest<HTMLElement>("[data-tab-key]")?.dataset.tabKey
    if (tab) return resolve.tab(tab)
    const row = fresh?.closest<HTMLElement>(ROW)?.dataset.sessionId
    if (row) return resolve.row(row)
    return undefined
  }

  const inspect = (content: HTMLElement) => {
    if (!hasDelete(content)) return
    if (undo.has(content)) {
      if (content.querySelector(OWN)) return
      undo.get(content)!()
      undo.delete(content)
    }
    const session = sessionOf(content)
    if (!session) return
    const lines = read(session)
    if (lines.length) undo.set(content, extendNative(content, lines))
  }

  return {
    /** `observe` hands back each menu element the host adds; the returned function stops watching. */
    start(observe: (inspect: (content: HTMLElement) => void) => () => void) {
      return observe((content) => inspect(content))
    },
    inspect,
    scan(root: ParentNode) {
      root.querySelectorAll<HTMLElement>(MENU).forEach(inspect)
    },
    stop() {
      doc.removeEventListener("contextmenu", remember, true)
      doc.removeEventListener("pointerdown", remember, true)
      doc.removeEventListener("keydown", keyed, true)
      for (const off of undo.values()) off()
      undo.clear()
    },
  }
}
