// A "No project" row inside the host's new-session project picker (a dialog: search input, project rows, "Other
// projects", a separator, "Add project"). 2.2.5 has no registry for it, so the row is injected next to "Add project"
// with the host's own classes, and takes part in the picker's keyboard and hover highlight by hand: the host's
// typeahead keeps its active row in private state that a foreign row cannot join.

export type PickerRow = {
  title: string
  description: string
  /** Extra words the search box matches, besides the title and description. */
  keywords: string[]
  /** The scratch folder once known. The row hides while the host already lists a project at it. */
  path: () => string | undefined
  /** The row's icon, a host `svg` (cloned in; the caller owns its lifetime). */
  icon: () => Element | undefined
  onSelect: () => void
}

const DIALOG = ".new-session-location"
const OPTION = '[role="option"]'

export function attachPicker(doc: Document, config: PickerRow): () => void {
  const win = doc.defaultView!
  let frame = 0
  let watching: MutationObserver | undefined
  let watched: Element | undefined
  // The native row the host still believes is active while this row is highlighted in its place.
  let displaced: Element | undefined

  const dialog = () => doc.querySelector(DIALOG)
  const mine = () => doc.querySelector<HTMLElement>("[data-no-project-row]")
  const options = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(OPTION)]
  const input = () => dialog()?.querySelector<HTMLInputElement>('input[role="combobox"]')
  const active = (el: Element | null | undefined) => !!el?.hasAttribute("data-active")

  function setActive(el: HTMLElement, on: boolean) {
    if (on) el.setAttribute("data-active", "")
    else el.removeAttribute("data-active")
    el.setAttribute("aria-selected", String(on))
  }

  function leave(restore: boolean) {
    const row = mine()
    if (!row || !active(row)) return
    setActive(row, false)
    if (restore && displaced?.isConnected) {
      setActive(displaced as HTMLElement, true)
      input()?.setAttribute("aria-activedescendant", displaced.id)
    }
    displaced = undefined
  }

  function enter() {
    const row = mine()
    if (!row || active(row)) return
    const current = options(row.parentElement!).find((item) => item !== row && active(item))
    if (current) setActive(current, false)
    displaced = current
    setActive(row, true)
    input()?.setAttribute("aria-activedescendant", row.id)
    row.scrollIntoView({ block: "nearest" })
  }

  const matches = (query: string) => {
    const needle = query.trim().toLowerCase()
    return !needle || [config.title, config.description, ...config.keywords].some((value) => value.toLowerCase().includes(needle))
  }

  function build(id: string) {
    const button = doc.createElement("button")
    button.type = "button"
    button.id = id
    button.className = "command-palette-row palette-menu-row"
    button.dataset.size = "compact"
    button.dataset.noProjectRow = ""
    button.setAttribute("role", "option")
    button.setAttribute("aria-selected", "false")
    const main = doc.createElement("div")
    main.className = "command-palette-row-main"
    const icon = config.icon()
    if (icon) main.append(icon)
    const text = doc.createElement("div")
    text.className = "command-palette-row-text"
    const title = doc.createElement("span")
    title.className = "command-palette-title palette-menu-title"
    title.textContent = config.title
    const description = doc.createElement("span")
    description.className = "command-palette-description"
    description.dir = "ltr"
    description.textContent = config.description
    text.append(title, description)
    main.append(text)
    button.append(main)
    return button
  }

  function sync() {
    frame = 0
    const root = dialog()
    const existing = mine()
    const group = root?.querySelector(".command-palette-group")
    const add = group && !group.querySelector(".new-session-location-back")
      ? options(group).find((item) => item.id.endsWith("-add"))
      : undefined
    const query = root?.querySelector<HTMLInputElement>('input[role="combobox"]')?.value ?? ""

    const path = config.path()
    const listed = !!path && [...group?.querySelectorAll(".command-palette-description") ?? []].some((el) => el.textContent === path)

    if (!root || !group || !add || listed || !matches(query)) {
      if (existing) {
        leave(true)
        existing.nextElementSibling?.matches("[data-no-project-separator]") && existing.nextElementSibling.remove()
        existing.remove()
      }
      return observe(root)
    }

    const list = group.closest('[role="listbox"]')?.id.replace(/-list$/, "") ?? "no-project"
    const item = existing ?? build(`${list}-no-project`)
    if (item.nextElementSibling !== add && item.nextElementSibling?.nextElementSibling !== add) add.before(item)
    // The host draws a separator before "Add project" only when something precedes it. This row is that something.
    const needsLine = item.previousElementSibling?.getAttribute("role") !== "separator"
    const line = item.nextElementSibling?.matches("[data-no-project-separator]") ? item.nextElementSibling : undefined
    if (needsLine && !line) {
      const created = doc.createElement("div")
      created.className = "new-session-location-action-divider"
      created.setAttribute("role", "separator")
      created.dataset.noProjectSeparator = ""
      item.after(created)
    } else if (!needsLine && line) line.remove()
    observe(root)
  }

  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(sync) }

  function observe(root: Element | null | undefined) {
    if (root === watched) return
    watching?.disconnect()
    watched = root ?? undefined
    if (!root) return
    watching = new win.MutationObserver((records) => {
      const row = mine()
      if (row && active(row) && records.some((r) => r.type === "attributes" && r.target !== row && active(r.target as Element))) {
        // The host moved its own highlight (hover, typing): this row gives its up.
        setActive(row, false)
        displaced = undefined
      }
      schedule()
    })
    watching.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] })
  }

  const onKey = (event: KeyboardEvent) => {
    const row = mine()
    if (!row || event.isComposing || !(event.target as Element | null)?.closest?.(DIALOG)) return
    const plain = !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
    if (!plain) return

    if (event.key === "Enter" && active(row)) {
      event.preventDefault()
      event.stopPropagation()
      row.click()
      return
    }

    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
    if (!delta) return
    const list = options(row.parentElement!)
    const here = list.findIndex(active)
    const index = list.indexOf(row)
    if (here < 0) return

    // Without the wrap: the host steps over this row only when it wraps, so these two moves are the only ones it misses.
    if (list[here] === row) {
      const next = list[here + delta]
      if (!next) return
      event.preventDefault()
      event.stopPropagation()
      const was = displaced
      leave(true)
      // A synthetic move with movement is what the host reads as the pointer entering a row.
      if (next !== was) next.dispatchEvent(new win.MouseEvent("mousemove", { bubbles: true, movementX: 1 }))
      return
    }
    if (here + delta === index) {
      event.preventDefault()
      event.stopPropagation()
      enter()
    }
  }

  const onMove = (event: MouseEvent) => {
    const row = mine()
    const target = (event.target as Element | null)?.closest?.(OPTION)
    if (!row || !target || (event.movementX === 0 && event.movementY === 0)) return
    if (target === row) enter()
    else leave(true)
  }

  const onInput = (event: Event) => {
    if (!(event.target as Element | null)?.closest?.(DIALOG)) return
    leave(true)
    schedule()
  }

  const onClick = (event: MouseEvent) => {
    if (!(event.target as Element | null)?.closest?.("[data-no-project-row]")) return
    event.preventDefault()
    // Close as Escape does, then act: the host restores the composer's focus when the dialog closes.
    input()?.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    config.onSelect()
  }
  const onDown = (event: MouseEvent) => {
    // The host keeps the search input focused through a click on a row.
    if ((event.target as Element | null)?.closest?.("[data-no-project-row]")) event.preventDefault()
  }

  const bodyObserver = new win.MutationObserver(() => { if (dialog() || mine()) schedule() })
  bodyObserver.observe(doc.body, { childList: true, subtree: true })
  doc.addEventListener("keydown", onKey, true)
  doc.addEventListener("mousemove", onMove, true)
  doc.addEventListener("input", onInput, true)
  doc.addEventListener("mousedown", onDown, true)
  doc.addEventListener("click", onClick, true)
  schedule()

  return () => {
    win.cancelAnimationFrame(frame)
    bodyObserver.disconnect()
    watching?.disconnect()
    doc.removeEventListener("keydown", onKey, true)
    doc.removeEventListener("mousemove", onMove, true)
    doc.removeEventListener("input", onInput, true)
    doc.removeEventListener("mousedown", onDown, true)
    doc.removeEventListener("click", onClick, true)
    leave(true)
    const item = mine()
    item?.nextElementSibling?.matches("[data-no-project-separator]") && item.nextElementSibling.remove()
    item?.remove()
  }
}
