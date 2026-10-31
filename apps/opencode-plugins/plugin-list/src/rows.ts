import { LABELS, type Entry, type Part } from "./entries"

const OWNED = "data-plugin-list"

/** Fills a row's actions container and returns what undoes it. */
export type Mount = (container: HTMLElement, entry: Entry) => () => void

const disposers = new WeakMap<Element, () => void>()

function remove(row: Element) {
  disposers.get(row)?.()
  row.remove()
}

function chip(document: Document, part: Part) {
  const element = document.createElement("span")
  element.setAttribute("data-component", "tag")
  element.setAttribute("data-appearance", "compact")
  element.setAttribute("data-variant", "neutral")
  element.setAttribute(OWNED, part)
  element.textContent = LABELS[part]
  return element
}

function ownChips(host: Element) {
  return [...host.querySelectorAll(`:scope > [${OWNED}]`)]
}

function chipsSignature(parts: readonly Part[]) {
  return parts.join(",")
}

// Chips the host row already shows are left alone, so a part never appears twice.
function addChips(document: Document, row: Element, parts: readonly Part[]) {
  const host = row.querySelector(".settings-provider-main")
  if (!host) return
  const shown = new Set(
    [...host.querySelectorAll('[data-component="tag"]:not([data-plugin-list])')].map((tag) => tag.textContent?.trim().toLowerCase()),
  )
  const wanted = parts.filter((part) => !shown.has(LABELS[part].toLowerCase()))
  const current = ownChips(host)
  if (chipsSignature(wanted) === current.map((tag) => tag.getAttribute(OWNED)).join(",")) return
  current.forEach((tag) => tag.remove())
  wanted.forEach((part) => host.append(chip(document, part)))
}

function createRow(document: Document, entry: Entry, icon: Element | undefined, mount: Mount) {
  const row = document.createElement("div")
  row.className = "settings-extension-row"
  row.setAttribute("data-plugin-list-row", entry.name)
  const lead = document.createElement("div")
  lead.className = "settings-extension-lead"
  if (icon) lead.append(icon.cloneNode(true))
  const copy = document.createElement("div")
  copy.className = "flex min-w-0 flex-col gap-0.5"
  const main = document.createElement("div")
  main.className = "settings-provider-main"
  const label = document.createElement("bdi")
  label.setAttribute("dir", "ltr")
  label.className = "settings-extension-name truncate"
  label.textContent = entry.name
  main.append(label)
  copy.append(main)
  if (entry.error !== undefined) {
    const error = document.createElement("span")
    error.className = "settings-server-dialog-error"
    error.textContent = entry.error
    copy.append(error)
  }
  lead.append(copy)
  row.append(lead)
  entry.parts.forEach((part) => main.append(chip(document, part)))
  const actions = document.createElement("div")
  actions.className = "settings-servers-actions"
  row.append(actions)
  disposers.set(row, mount(actions, entry))
  return row
}

const signature = (entry: Entry) => `${chipsSignature(entry.parts)}|${entry.enabled}|${entry.error ?? ""}`

/** Adds the missing part chips to rows the host drew and rows for plugins the host did not list. */
export function sync(document: Document, panel: Element, entries: readonly Entry[], mount: Mount) {
  const list = panel.querySelector('[data-component="settings-list"]')
  if (!list) return
  const hostRows = new Map<string, Element>()
  for (const row of list.querySelectorAll(":scope > .settings-extension-row:not([data-plugin-list-row])")) {
    const name = row.querySelector(".settings-extension-name")?.textContent?.trim()
    if (name) hostRows.set(name, row)
  }
  const icon = list.querySelector(".settings-extension-lead > :first-child:not(div)") ?? undefined
  const own = new Map([...list.querySelectorAll(":scope > [data-plugin-list-row]")].map((row) => [row.getAttribute("data-plugin-list-row")!, row]))

  for (const entry of entries) {
    const host = hostRows.get(entry.name)
    if (host) {
      addChips(document, host, entry.parts)
      const stale = own.get(entry.name)
      if (stale) remove(stale)
      continue
    }
    const existing = own.get(entry.name)
    const next = signature(entry)
    if (existing?.getAttribute("data-plugin-list-sig") === next) continue
    if (existing) remove(existing)
    const row = createRow(document, entry, icon, mount)
    row.setAttribute("data-plugin-list-sig", next)
    list.append(row)
  }
  const names = new Set(entries.map((entry) => entry.name))
  for (const [name, row] of own) if (!names.has(name)) remove(row)
}

export function cleanup(document: Document) {
  document.querySelectorAll("[data-plugin-list-row]").forEach(remove)
  document.querySelectorAll("[data-plugin-list]").forEach((element) => element.remove())
}
