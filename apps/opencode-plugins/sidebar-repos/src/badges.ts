export function basename(path: string) {
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? ""
}

// Branch names contain "/" too, so the separator cannot look like one.
export function label(name: string, branch?: string) {
  return branch ? `${name} · ${branch}` : name
}

// An end-only CSS ellipsis would cut the branch tail; dropping the middle keeps the repo head and
// the branch tail. Binary-search the longest kept length whose head/tail split fits `max` pixels.
export function truncateMiddle(
  text: string,
  max: number,
  measure: (value: string) => number,
  startShare = 0.75,
) {
  if (max < 0 || measure(text) <= max) return text

  let best = "…"
  let lo = 0
  let hi = text.length - 1

  while (lo <= hi) {
    const kept = Math.floor((lo + hi) / 2)
    const head = Math.ceil(kept * startShare)
    const candidate = text.slice(0, head) + "…" + text.slice(text.length - (kept - head))

    if (measure(candidate) <= max) {
      best = candidate
      lo = kept + 1
    } else {
      hi = kept - 1
    }
  }

  return best
}

// Phosphor (regular weight): the "!" for a permission request, the "?" for a question form.
export type AttentionKind = "permission" | "question"

export function attentionKind(
  permissions: readonly unknown[] | undefined,
  forms: readonly unknown[] | undefined,
): AttentionKind | undefined {
  return (permissions?.length ?? 0) > 0 ? "permission" : (forms?.length ?? 0) > 0 ? "question" : undefined
}

const attentionIcons: Record<AttentionKind, string> = {
  permission:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/></svg>',
  question:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>',
}

// The GUI SDK has no shell-tab label slot; keep the DOM workaround isolated here.
// `display` optionally rewrites the visible text (middle truncation); the tooltip keeps the full label.
// `attention` drives the injected status icon: permission → "!", question → "?"; the app's blue
// unread dot and busy ring stay native.
export function badges(
  document: Document,
  names: ReadonlyMap<string, string>,
  display?: (badge: HTMLElement, full: string) => string,
  attention: ReadonlyMap<string, AttentionKind> = new Map(),
) {
  for (const tab of document.querySelectorAll<HTMLElement>("[data-tab-key]")) {
    const title = tab.querySelector<HTMLElement>("[data-slot='tab-title']")
    const existing = tab.querySelector<HTMLElement>("[data-sidebar-repo]")
    const key = tab.getAttribute("data-tab-key") ?? ""
    const full = names.get(key)

    // Icon spans for both kinds go in once; CSS shows the one the tab's attention kind picks.
    const owner = tab.querySelector<HTMLElement>("[data-titlebar-tab]") ?? tab
    const status = owner.querySelector<HTMLElement>("[data-slot='tab-status']")
    if (status) {
      for (const kind of ["permission", "question"] as const) {
        let icon = status.querySelector<HTMLElement>(`[data-sidebar-status-icon='${kind}']`)
        if (!icon) {
          icon = document.createElement("span")
          icon.setAttribute("data-sidebar-status-icon", kind)
          icon.innerHTML = attentionIcons[kind]
          status.append(icon)
        }
      }
      const kind = attention.get(key)
      if (kind) owner.setAttribute("data-sidebar-attention", kind)
      else owner.removeAttribute("data-sidebar-attention")
    }

    if (!title || !full || tab.getAttribute("data-orientation") !== "vertical") {
      existing?.remove()
      continue
    }

    const badge = existing ?? document.createElement("span")
    if (!existing) {
      badge.setAttribute("data-sidebar-repo", "")
      title.before(badge)
    }

    const visible = display?.(badge, full) ?? full
    if (badge.textContent !== visible) badge.textContent = visible
    if (badge.title !== full) badge.title = full
  }
}
