const ROOT = '[data-action="settings-background-activity"]'
const OPTION = "data-agents-option"
const ON = "data-agents-on"

export type BackgroundOption = {
  label: string
  /** Whether "Subagents panel" is the chosen mode. Reactive reads are fine; it is polled on every pass. */
  enabled(): boolean
  set(enabled: boolean): void
}

/**
 * Adds "Subagents panel" as a fifth choice of Settings > Timeline > Background activity. The host exposes no way to add
 * an option to its select and stores the value as a closed enum (`off | left | center | right`), so the choice is a
 * clone of a host option that, when picked, commits the host's own "Hidden" and records the mode in the plugin's store.
 * Picking any host option turns the mode off again, so the host value is never one it cannot validate.
 */
export function installBackgroundOption(option: BackgroundOption): (() => void) & { refresh(): void } {
  let committing = false
  let queued = false
  let disposed = false

  const hostItems = (list: Element) => [...list.querySelectorAll<HTMLElement>(`[role="option"]:not([${OPTION}])`)]
  const mark = (nodes: Element[], on: boolean) => {
    for (const node of nodes) node.toggleAttribute("data-highlighted", on)
  }

  const build = (list: Element): HTMLElement | undefined => {
    const template = list.querySelector<HTMLElement>('[role="option"][data-key="center"]')
    if (!template) return
    const item = template.cloneNode(true) as HTMLElement
    const label = item.querySelector<HTMLElement>('[data-slot="menu-v2-item-content"]')!
    const indicator = item.querySelector<HTMLElement>('[data-slot="menu-v2-item-indicator"]')!
    for (const node of [item, label, indicator]) {
      node.removeAttribute("id")
      node.removeAttribute("data-selected")
      node.removeAttribute("data-highlighted")
    }
    item.removeAttribute("data-key")
    item.setAttribute(OPTION, "")
    item.tabIndex = -1
    label.id = `${list.id}-agents-label`
    item.setAttribute("aria-labelledby", label.id)
    label.textContent = option.label
    item.addEventListener("pointerup", (event) => choose(event, list))
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") choose(event, list)
      else if (event.key === "ArrowUp") move(event, list, -1)
    })
    item.addEventListener("pointermove", () => highlight(list, item))
    return item
  }

  const highlight = (list: Element, item: HTMLElement) => {
    mark(hostItems(list), false)
    for (const host of hostItems(list)) host.tabIndex = -1
    mark([item, ...item.querySelectorAll("[data-slot]")], true)
    item.tabIndex = 0
    item.focus({ preventScroll: true })
  }

  const move = (event: Event, list: Element, step: 1 | -1) => {
    const items = hostItems(list)
    const target = step === 1 ? undefined : items.at(-1)
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    mark([...list.querySelectorAll(`[${OPTION}], [${OPTION}] [data-slot]`)], false)
    for (const item of list.querySelectorAll<HTMLElement>(`[${OPTION}]`)) item.tabIndex = -1
    mark([target, ...target.querySelectorAll("[data-slot]")], true)
    target.tabIndex = 0
    target.focus({ preventScroll: true })
  }

  const choose = (event: Event, list: Element) => {
    event.preventDefault()
    event.stopPropagation()
    const off = list.querySelector<HTMLElement>('[role="option"][data-key="off"]')
    // Kobalte selects on pointerup and closes the popup; the host's "Hidden" does both.
    committing = true
    try {
      off?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }))
      off?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    } finally {
      committing = false
    }
    option.set(true)
  }

  const sync = () => {
    const root = document.querySelector<HTMLElement>(ROOT)
    const on = option.enabled()
    if (!root) return
    const trigger = root.querySelector<HTMLElement>('[data-component="select-v2"]')
    const value = root.querySelector<HTMLElement>('[data-slot="select-v2-value-text"]:not([data-agents-value])')
    root.toggleAttribute(ON, on)
    const shown = root.querySelector<HTMLElement>("[data-agents-value]")
    if (on && value && !shown) {
      const clone = value.cloneNode(false) as HTMLElement
      clone.id = `${value.id}-agents`
      clone.setAttribute("data-agents-value", "")
      clone.textContent = option.label
      value.after(clone)
      trigger?.setAttribute("aria-labelledby", `${trigger.id} ${clone.id}`)
    } else if (!on && shown) {
      shown.remove()
      trigger?.setAttribute("aria-labelledby", `${trigger.id} ${value?.id ?? ""}`.trim())
    }

    const list = document.getElementById(`${root.id}-listbox`)
    if (!list) return
    const built = list.querySelector<HTMLElement>(`[${OPTION}]`) ?? build(list)
    if (!built) return
    const ours = built
    if (!ours.isConnected) list.append(ours)
    list.toggleAttribute(ON, on)
    for (const node of [ours, ...ours.querySelectorAll("[data-slot]")]) node.toggleAttribute("data-selected", on)
    ours.setAttribute("aria-selected", String(on))
    // A host value other than "Hidden" under an enabled mode was set elsewhere; the host wins.
    const selected = hostItems(list).find((item) => item.hasAttribute("data-selected"))
    if (on && selected && selected.dataset.key !== "off" && !committing) option.set(false)
  }

  const schedule = () => {
    if (queued || disposed) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      if (!disposed) sync()
    })
  }

  // A host option picked while the mode is on leaves the mode: capture runs before Kobalte's own handler.
  const leave = (event: Event) => {
    if (committing) return
    const item = (event.target as Element | null)?.closest?.('[role="option"]')
    if (!item || item.hasAttribute(OPTION)) return
    if (event.type === "keydown" && (event as KeyboardEvent).key !== "Enter" && (event as KeyboardEvent).key !== " ") return
    const list = item.closest('[role="listbox"]')
    if (!list || !document.querySelector(ROOT) || list.id !== `${document.querySelector(ROOT)!.id}-listbox`) return
    option.set(false)
  }
  // ArrowDown past the last host option reaches ours, which Kobalte's collection does not know.
  const down = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown") return
    const item = (event.target as Element | null)?.closest?.('[role="option"]') as HTMLElement | null
    const list = item?.closest('[role="listbox"]')
    const ours = list?.querySelector<HTMLElement>(`[${OPTION}]`)
    if (!item || !list || !ours || item.hasAttribute(OPTION) || hostItems(list).at(-1) !== item) return
    event.preventDefault()
    event.stopPropagation()
    highlight(list, ours)
  }

  // Kobalte highlights its own options by hover and focus; ours must yield when one of them takes over.
  const release = (event: Event) => {
    const item = (event.target as Element | null)?.closest?.('[role="option"]')
    if (!item || item.hasAttribute(OPTION)) return
    const ours = item.closest('[role="listbox"]')?.querySelector<HTMLElement>(`[${OPTION}]`)
    if (!ours?.hasAttribute("data-highlighted")) return
    for (const node of [ours, ...ours.querySelectorAll("[data-slot]")]) node.removeAttribute("data-highlighted")
    ours.tabIndex = -1
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  for (const type of ["pointerup", "keydown"]) document.addEventListener(type, leave, true)
  document.addEventListener("keydown", down, true)
  for (const type of ["pointermove", "focusin"]) document.addEventListener(type, release, true)
  schedule()

  const dispose = () => {
    disposed = true
    observer.disconnect()
    for (const type of ["pointerup", "keydown"]) document.removeEventListener(type, leave, true)
    document.removeEventListener("keydown", down, true)
    for (const type of ["pointermove", "focusin"]) document.removeEventListener(type, release, true)
    for (const node of document.querySelectorAll(`[${OPTION}], [data-agents-value]`)) node.remove()
    for (const node of document.querySelectorAll(`[${ON}]`)) node.removeAttribute(ON)
  }
  return Object.assign(dispose, { refresh: schedule })
}
