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

// A permission request shows the catalog "warning" icon, a question form "help"; see gui.ts.
export type AttentionKind = "permission" | "question"

export function attentionKind(
  permissions: readonly unknown[] | undefined,
  forms: readonly unknown[] | undefined,
): AttentionKind | undefined {
  return (permissions?.length ?? 0) > 0 ? "permission" : (forms?.length ?? 0) > 0 ? "question" : undefined
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
  mountIcon?: (host: HTMLElement, kind: AttentionKind) => void,
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
          mountIcon?.(icon, kind)
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
