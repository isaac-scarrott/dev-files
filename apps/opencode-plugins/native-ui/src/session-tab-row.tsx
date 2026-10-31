import { Show, type JSX, type ParentProps } from "solid-js"
import type { Ui } from "@opencode/plugin/gui"
import { ProjectAvatar, type ProjectAvatarStyle } from "./project-avatar"

// Host source: app/src/shell/titlebar/tab-strip.tsx (SortableTab slot) wrapping app/src/shell/titlebar/tab-popover.tsx
// (HoverCard trigger) wrapping app/src/shell/titlebar/tab-nav.tsx (TabNavItem). The slot, trigger and row markup are
// copied so the host's tab-nav.css, the sidebar-repos two-line grid and the 4px list gap style this row like a live tab.
// A row of ours never carries data-tab-key: the host tab strip, tab actions and sidebar-repos key on it.

// MouseEvent.button uses 1 for the middle/wheel button.
const MIDDLE_MOUSE_BUTTON = 1

export interface SessionTabRowProps {
  ui: Ui
  title: string
  /** Lettered avatar; defaults to the title's first grapheme. */
  avatar?: { fallback?: string; src?: string; variant?: ProjectAvatarStyle }
  /** The second line, in the live row's language ("repo · branch"). Shown only when sidebar-repos is loaded. */
  project?: string
  /** Secondary detail appended to the second line ("repo · branch · 9:00"). */
  detail?: string
  href?: string
  /** Fires on primary mousedown and on keyboard activation, as the live tab navigates. */
  onOpen?(): void
  /** Middle click; the live tab closes itself. */
  onMiddleClick?(): void
  onContextMenu?(event: MouseEvent): void
  active?: boolean
  pressed?: boolean
  /** The host's busy ring, attention or unread marks; a row of ours has none unless told. */
  status?: "busy" | "attention" | "unread"
  /** Rendered inside the close slot: TabRowAction or TabCloseButton. */
  action?: JSX.Element
  /** A row that opens nothing is reachable by its action buttons only, as the host's draft tab is. */
  tabIndex?: number
  ref?(el: HTMLDivElement): void
}

/** True once sidebar-repos' Style is in the document; its CSS turns `[data-sidebar-repo]` into the second line. */
export const hasSidebarRepos = (doc: Document) => !!doc.querySelector("style[data-plugin='sidebar-repos']")

export const sessionTabRowClass = {
  slot: "relative flex w-full shrink-0",
  row: "group relative flex h-7 w-full min-w-0 select-none flex-row items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[6px] px-1.5 [container-type:inline-size]",
  link: "flex h-full min-w-0 flex-1 flex-row items-center gap-1.5 text-[13px] font-medium text-v2-text-text-faint group-data-[active='true']:text-v2-text-text-base group-data-[editing='true']:text-v2-text-text-base [-webkit-user-drag:none]",
  avatarSlot: "flex size-4 shrink-0 items-center justify-center",
  title: "min-w-0 flex-1 outline-none leading-4 overflow-hidden text-clip whitespace-nowrap",
} as const

/**
 * A list of rows, laid out as the host's vertical tab list under sidebar-repos (flex column, 4px between rows). The
 * host's own list carries data-titlebar-tab-list, which the tab strip's drag sorting keys on, so this one does not.
 */
export function SessionTabList(props: ParentProps<{ label?: string }>) {
  return (
    <div data-session-tab-list role="list" aria-label={props.label} class="flex w-full min-w-0 flex-col items-stretch" style={{ gap: "4px" }}>
      {props.children}
    </div>
  )
}

const stop = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

export function SessionTabRow(props: SessionTabRowProps) {
  const secondLine = () => {
    if (!props.project) return
    return props.detail ? `${props.project} · ${props.detail}` : props.project
  }
  const twoLine = () => !!secondLine() && hasSidebarRepos(document)
  return (
    <div data-titlebar-tab-slot data-active={!!props.active} data-orientation="vertical" class={sessionTabRowClass.slot}>
      <div data-component="session-tab-popover-trigger" role="link" tabindex="-1" data-closed="">
        <div
          ref={(el) => props.ref?.(el)}
          data-titlebar-tab
          data-slot="titlebar-tab-item"
          data-orientation="vertical"
          data-title-overflow="false"
          data-editing="false"
          class={sessionTabRowClass.row}
          data-active={!!props.active}
          data-dragging="false"
          data-status={props.status}
          data-state={props.active || props.pressed ? "pressed" : undefined}
          onMouseDown={(event) => {
            if (event.button !== MIDDLE_MOUSE_BUTTON) return
            stop(event)
          }}
          onAuxClick={(event) => {
            if (event.button !== MIDDLE_MOUSE_BUTTON) return
            stop(event)
            props.onMiddleClick?.()
          }}
        >
          <a
            data-slot="tab-link"
            data-titlebar-tab-link="true"
            aria-haspopup={props.onContextMenu ? "menu" : undefined}
            aria-expanded={props.onContextMenu ? "false" : undefined}
            data-closed={props.onContextMenu ? "" : undefined}
            onContextMenu={(event) => props.onContextMenu?.(event)}
            href={props.href ?? "#"}
            draggable={false}
            tabindex={props.tabIndex}
            onDragStart={stop}
            onMouseDown={(event) => {
              // Navigate on mousedown to shave the press-release delay off tab switches.
              if (event.button !== 0) return
              props.onOpen?.()
            }}
            onClick={(event) => {
              event.preventDefault()
              // Mouse navigation already happened on mousedown; detail 0 means keyboard activation.
              if (event.detail > 0) return
              props.onOpen?.()
            }}
            class={sessionTabRowClass.link}
          >
            <span data-slot="project-avatar-slot" class={sessionTabRowClass.avatarSlot}>
              <ProjectAvatar fallback={props.avatar?.fallback ?? props.title} src={props.avatar?.src} variant={props.avatar?.variant} />
              <Show when={props.status === "attention" || props.status === "unread"}>
                <span data-slot="tab-avatar-unread-dot" aria-hidden="true" />
              </Show>
            </span>
            <Show when={twoLine()}>
              <span data-sidebar-repo title={secondLine()}>
                {/* Split only when there is a detail, so a consumer can truncate the project and keep the detail whole. */}
                <Show when={props.detail} fallback={props.project}>
                  <span data-sidebar-repo-main>{props.project}</span>
                  <span data-sidebar-repo-detail>{` · ${props.detail}`}</span>
                </Show>
              </span>
            </Show>
            <span data-slot="tab-title" data-titlebar-tab-title dir="auto" class={sessionTabRowClass.title}>
              {props.title}
            </span>
          </a>
          <div data-slot="tab-close">
            <span data-slot="tab-status" aria-hidden="true">
              <span data-mark="attention" data-slot="tab-status-dot" />
              <span data-mark="unread" data-slot="tab-status-dot" />
            </span>
            {props.action}
          </div>
        </div>
      </div>
    </div>
  )
}
