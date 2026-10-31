import { createSignal, onCleanup, onMount, Show, type JSX, type ParentProps } from "solid-js"

// Host source: ui/src/navigation/menu/menu.tsx (Menu.Content, Menu.Item, Menu.Separator) over Kobalte's DropdownMenu.
// The markup and the attributes Kobalte sets on its items are copied, so the host's menu-v2 CSS styles them; the
// roving focus Kobalte provides is reimplemented below. ctx.ui offers no menu or menu item component.

export interface MenuItemProps {
  onSelect(): void
  shortcut?: JSX.Element | string
  /** The host's red item, as its "Delete…". */
  variant?: "critical"
  disabled?: boolean
  /** A submenu trigger: aria-haspopup plus the host's chevron. */
  submenu?: boolean
}

const ITEM = '[role="menuitem"]:not([aria-disabled="true"])'

/** The host's submenu chevron (ui/src/navigation/menu/menu.tsx, ChevronRight). */
export function MenuChevron() {
  return (
    <svg data-slot="menu-v2-item-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4L10 8L6 12V4Z" fill="currentColor" />
    </svg>
  )
}

export function MenuItem(props: ParentProps<MenuItemProps>) {
  const choose = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    if (props.disabled) return
    props.onSelect()
  }
  return (
    <div
      role="menuitem"
      tabindex="-1"
      data-component="menu-v2-item"
      data-appearance="compact"
      data-variant={props.variant}
      data-disabled={props.disabled ? "" : undefined}
      aria-disabled={props.disabled ? "true" : "false"}
      aria-haspopup={props.submenu ? "true" : undefined}
      aria-expanded={props.submenu ? "false" : undefined}
      onClick={choose}
      onPointerEnter={(event) => {
        if (props.disabled) return
        highlight(event.currentTarget)
      }}
      onFocus={(event) => {
        // Kobalte marks whichever item holds focus, however it got there.
        if (!event.currentTarget.hasAttribute("data-highlighted")) highlight(event.currentTarget)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " " && !(props.submenu && event.key === "ArrowRight")) return
        choose(event)
      }}
    >
      <span data-slot="menu-v2-item-content">{props.children}</span>
      <Show when={props.shortcut}>{(shortcut) => <span data-slot="menu-v2-item-shortcut">{shortcut()}</span>}</Show>
      <Show when={props.submenu}>
        <MenuChevron />
      </Show>
    </div>
  )
}

/** The host's separator is a bare <hr> (Kobalte's Menu.Separator) with no role attribute; snooze-archive anchors on it. */
export function MenuSeparator() {
  return <hr data-orientation="horizontal" data-slot="menu-v2-separator" data-appearance="compact" />
}

/** One highlighted item at a time, as Kobalte marks the focused key; it alone is tabindex 0 (roving tabindex). */
export function highlight(item: HTMLElement) {
  const menu = item.closest('[role="menu"]')
  menu?.querySelectorAll<HTMLElement>("[data-highlighted], [role=menuitem][tabindex='0']").forEach((el) => {
    el.removeAttribute("data-highlighted")
    el.tabIndex = -1
  })
  item.setAttribute("data-highlighted", "")
  item.tabIndex = 0
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

export interface MenuContentProps {
  /** The host's tab menu carries no label; set one only when the menu has no visible trigger text. */
  label?: string
  /** Escape, or a left arrow inside a submenu. */
  onClose?(): void
  /** Focus the first item when the menu opens (keyboard open); pointer opens leave the pointer in charge. */
  autofocus?: boolean
  /** Take focus on open (the default, as Kobalte does); false leaves focus where it was. */
  focus?: boolean
  /** A submenu: ArrowLeft closes it back to its parent. */
  sub?: boolean
  ref?(el: HTMLDivElement): void
}

export function MenuContent(props: ParentProps<MenuContentProps>) {
  let root!: HTMLDivElement
  const items = () => Array.from(root.querySelectorAll<HTMLElement>(ITEM))
  const [open, setOpen] = createSignal(false)
  onMount(() => {
    props.ref?.(root)
    requestAnimationFrame(() => setOpen(true))
    if (props.focus === false) return
    if (props.autofocus) {
      const first = items()[0]
      if (first) highlight(first)
    } else root.focus({ preventScroll: true })
  })
  onCleanup(() => setOpen(false))
  return (
    <div
      ref={root}
      role="menu"
      tabindex="0"
      aria-label={props.label}
      data-component="menu-v2-content"
      data-appearance="compact"
      data-expanded={open() ? "" : undefined}
      data-closed={open() ? undefined : ""}
      onKeyDown={(event) => {
        if (event.key === "Escape" || (props.sub && event.key === "ArrowLeft")) {
          event.preventDefault()
          event.stopPropagation()
          props.onClose?.()
          return
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const active = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ITEM) ?? undefined : undefined
        const next = nextItem(items(), active, event.key)
        if (next) highlight(next)
      }}
      onPointerLeave={() => root.querySelectorAll("[data-highlighted]").forEach((el) => el.removeAttribute("data-highlighted"))}
    >
      {props.children}
    </div>
  )
}
