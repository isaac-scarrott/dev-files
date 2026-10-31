import { Plugin, Style } from "@opencode/plugin/gui"
import { createEffect } from "solid-js"
import { attentionKind, badges, basename, label, truncateMiddle, type AttentionKind } from "./badges"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, `
      [data-titlebar-tab][data-orientation='vertical']:has([data-sidebar-repo]) {
        height: 52px;
        padding-block: 5px;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        grid-template-rows: 14px 16px;
        column-gap: 5px;
        row-gap: 6px;
        align-content: center;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) > [data-slot='project-avatar-slot'] {
        grid-column: 1;
        grid-row: 1;
        width: 14px;
        height: 14px;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) > [data-slot='project-avatar-slot'] > * {
        max-width: 14px;
        max-height: 14px;
      }
      [data-slot='tab-link'] > [data-sidebar-repo] {
        grid-column: 2;
        grid-row: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--v2-text-text-muted);
        font-size: 11px;
        line-height: 14px;
        font-weight: 400;
      }
      [data-slot='tab-link']:has(> [data-sidebar-repo]) > [data-slot='tab-title'] {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        font-size: 13px;
        line-height: 16px;
      }
      /* No fades: the scroll list fades top/bottom and the title fades at its edge; both are masks. */
      [data-slot='vertical-tabs-scroll'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      [data-titlebar-tab][data-orientation='vertical'] [data-slot='tab-link'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /* Attention shows a Phosphor icon instead of the dot; unread keeps its blue dot, busy its ring. */
      [data-titlebar-tab] [data-slot='tab-status'] > [data-mark='attention'] {
        display: none !important;
      }
      [data-titlebar-tab] [data-sidebar-status-icon] {
        grid-area: 1 / 1;
        display: none;
        width: 14px;
        height: 14px;
        color: var(--v2-state-fg-warning);
      }
      [data-titlebar-tab][data-status='attention'][data-sidebar-attention='permission'] [data-sidebar-status-icon='permission'],
      [data-titlebar-tab][data-status='attention'][data-sidebar-attention='question'] [data-sidebar-status-icon='question'] {
        display: block;
      }
    `)

    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    const measure = (font: string, value: string) => {
      if (context) {
        if (context.font !== font) context.font = font

        return context.measureText(value).width
      }
      return value.length * 6
    }

    // Middle truncation: the repo head and the branch tail survive; the tooltip keeps the full label.
    const display = (badge: HTMLElement, full: string) => {
      const available = badge.getBoundingClientRect().width - 1

      if (!(available > 0)) return full

      const style = window.getComputedStyle(badge)
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

      return truncateMiddle(full, available, (value) => measure(font, value))
    }

    const observed = new WeakSet<HTMLElement>()

    let names = new Map<string, string>()
    let attention = new Map<string, AttentionKind>()
    let frame: number | undefined
    const refresh = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        badges(document, names, display, attention)
        document
          .querySelectorAll<HTMLElement>("[data-titlebar-tab][data-orientation='vertical']")
          .forEach((element) => {
            if (observed.has(element)) return
            observed.add(element)
            resizeObserver.observe(element)
          })
      })
    }

    const resizeObserver = new ResizeObserver(refresh)

    createEffect(() => {
      for (const session of ctx.sessions.list()) {
        if (!session.location) continue
        const data = session.server.data
        void data.location.vcs.sync(session.location).catch((error: unknown) => {
          console.warn("sidebar-repos: could not load workspace branch", error)
        })
        // A pending permission or question form reads as attention; errors surface as unread, not a mark.
        void data.session.permission.sync(session.id).catch(() => undefined)
        void data.session.form.sync(session.id).catch(() => undefined)
      }
    })

    createEffect(() => {
      names = new Map(ctx.tabs.list().flatMap((tab) => {
        const session = tab.session
        if (!session) return []
        const info = session.server.data.session.get(session.id)
        const project = info ? session.server.data.project.get(info.projectID) : undefined
        const name = basename(project?.canonical ?? session.location?.directory ?? "")
        const branch = session.location
          ? session.server.data.location.vcs.info(session.location)?.branch.current
          : undefined
        return name ? [[tab.key, label(name, branch)] as const] : []
      }))
      attention = new Map(ctx.tabs.list().flatMap((tab) => {
        const session = tab.session
        if (!session) return []
        const data = session.server.data
        const kind = attentionKind(data.session.permission.list(session.id), data.session.form.list(session.id))
        return kind ? [[tab.key, kind] as const] : []
      }))
      refresh()
    })

    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-tab-key", "data-orientation", "data-status"],
    })

    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      document.querySelectorAll("[data-sidebar-repo]").forEach((badge) => badge.remove())
      document.querySelectorAll("[data-sidebar-status-icon]").forEach((icon) => icon.remove())
      document
        .querySelectorAll("[data-sidebar-attention]")
        .forEach((element) => element.removeAttribute("data-sidebar-attention"))
    }
  },
})
