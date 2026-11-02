import { Plugin, Style } from "@opencode/plugin/gui"
import { createEffect } from "solid-js"
import { render } from "solid-js/web"
import { createTicker, lastActivity } from "./activity"
import { removeTimes, renderTimes, stampActivity } from "./rowtime"
import { attentionKind, badges, basename, truncateMiddle, type AttentionKind } from "./badges"

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
      [data-titlebar-tab-list][data-orientation='vertical'] {
        gap: 4px;
      }
      /* Home lives on its keybind; the sidebar row is redundant. */
      [data-action='vertical-tabs-home'] {
        display: none !important;
      }
      /* The native list fade masks the status mark too. */
      [data-slot='vertical-tabs-scroll'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /*
       * Text yields to whatever sits at the row's trailing edge (a status mark, a time, or the close button on hover) through
       * one mask on the full-height link, so the badge and title lines fade as a single band. The marks live outside
       * the link and are never masked. Same shape as the native link mask: 16px ramp, clear from --sidebar-fade in
       * (24px mark + 6px gap); idle rows keep no fade. Not animated, like the native one.
       */
      [data-titlebar-tab][data-orientation='vertical'] {
        --sidebar-fade: 30px;
      }
      /* The archive action sits left of the close button: 30px in, 20px wide. */
      [data-titlebar-tab-slot]:has(> [data-sa-actions]) [data-titlebar-tab][data-orientation='vertical']:is(:hover, :focus-within) {
        --sidebar-fade: 56px;
      }
      [data-titlebar-tab][data-orientation='vertical'] [data-slot='tab-link'] {
        -webkit-mask-image: none !important;
        mask-image: none !important;
      }
      /*
       * Last activity, in the status mark's slot (20px box, 4px from the end) and the title's end padding (6px).
       * Shown only on a row with no indicator; hidden under the row's hover and focus affordances as the status mark is
       * (no transition, like it). The text fade stops short of it: width measured into --sidebar-time-width.
       */
      [data-titlebar-tab] [data-sidebar-time] {
        position: absolute;
        inset-block: 0;
        inset-inline-end: 2px;
        display: flex;
        align-items: center;
        font-size: 11px;
        line-height: 14px;
        font-weight: 400;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        color: var(--v2-text-text-muted);
        pointer-events: none;
      }
      [data-titlebar-tab]:is(:hover, :has(:focus-visible)) [data-sidebar-time] {
        opacity: 0;
      }
      [data-titlebar-tab][data-orientation='vertical'][data-sidebar-time-shown]:not(:hover):not(:has(:focus-visible)) {
        --sidebar-fade: calc(var(--sidebar-time-width, 0px) + 12px);
      }
      [data-titlebar-tab][data-orientation='vertical']:is([data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention], [data-sidebar-time-shown], [data-sa-woke], :hover, :focus-within) [data-slot='tab-link'] {
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--sidebar-fade) - 16px), transparent calc(100% - var(--sidebar-fade))) !important;
        mask-image: linear-gradient(to right, #000 calc(100% - var(--sidebar-fade) - 16px), transparent calc(100% - var(--sidebar-fade))) !important;
      }
      /* Attention shows a catalog icon instead of the dot; unread keeps its blue dot, busy its ring. */
      [data-titlebar-tab][data-sidebar-attention] [data-slot='tab-status'] > [data-mark='attention'] {
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

    const timeFont = () => {
      const style = window.getComputedStyle(document.body)
      return `400 11px ${style.fontFamily}`
    }

    const observed = new Set<HTMLElement>()

    // Status icons are the app's own catalog icons, mounted into the injected slots.
    const iconNames = { permission: "warning", question: "help" } as const
    const icons = new Map<HTMLElement, () => void>()
    const mountIcon = (host: HTMLElement, kind: AttentionKind) => {
      icons.set(host, render(() => ctx.ui.Icon({ name: iconNames[kind], size: "small" }), host))
    }

    let names = new Map<string, string>()
    let attention = new Map<string, AttentionKind>()
    let activity = new Map<string, number>()
    let frame: number | undefined
    const refresh = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        stampActivity(document, activity)
        badges(document, names, display, attention, mountIcon)
        renderTimes(document, Date.now(), (text) => measure(timeFont(), text))
        for (const [host, dispose] of icons) {
          if (host.isConnected) continue
          dispose()
          icons.delete(host)
        }
        for (const element of observed) {
          if (element.isConnected && element.matches("[data-titlebar-tab][data-orientation='vertical']")) continue
          resizeObserver.unobserve(element)
          observed.delete(element)
        }
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
        const data = session.server.data
        // A pending permission or question form reads as attention; errors surface as unread, not a mark.
        void data.session.permission.sync(session.id).catch(() => undefined)
        void data.session.form.sync(session.id).catch(() => undefined)
      }
    })

    // Last activity needs each open thread's messages; fetched once per session, then kept current by the store.
    const messagesRequested = new Set<string>()
    createEffect(() => {
      for (const tab of ctx.tabs.list()) {
        const session = tab.session
        if (!session) continue
        const key = `${session.server.id}:${session.id}`
        if (messagesRequested.has(key)) continue
        messagesRequested.add(key)
        void session.server.data.session.message.sync(session.id).catch(() => messagesRequested.delete(key))
      }
    })

    createEffect(() => {
      activity = new Map(ctx.tabs.list().flatMap((tab) => {
        const session = tab.session
        if (!session) return []
        const data = session.server.data
        const at = lastActivity(data.session.message.list(session.id), data.session.get(session.id)?.time.updated)
        return at === undefined ? [] : [[tab.key, at] as const]
      }))
      refresh()
    })

    createEffect(() => {
      names = new Map(ctx.tabs.list().flatMap((tab) => {
        const session = tab.session
        if (!session) return []
        const info = session.server.data.session.get(session.id)
        const project = info ? session.server.data.project.get(info.projectID) : undefined
        const name = basename(project?.canonical ?? session.location?.directory ?? "")
        return name ? [[tab.key, name] as const] : []
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

    const owned = (node: Node) => {
      const element = node.nodeType === 1 ? node as Element : node.parentElement
      return !!element?.closest("[data-sidebar-repo], [data-sidebar-status-icon], [data-sidebar-time]")
    }
    // The observer sits on the whole document (the sidebar mounts anywhere), but only the sidebar's own changes matter:
    // the timeline mutates on every scroll and streamed delta, and each of those used to cost a full row pass.
    const SIDEBAR = "[data-tab-key], [data-titlebar-tab-list], [data-titlebar-tab], [data-slot='vertical-tabs-scroll'], [data-action='vertical-tabs-home']"
    const inSidebar = (node: Node) => {
      const element = node.nodeType === 1 ? node as Element : node.parentElement
      return !!element?.closest(SIDEBAR)
    }
    const bringsSidebar = (node: Node) => node.nodeType === 1 && ((node as Element).matches(SIDEBAR) || !!(node as Element).querySelector(SIDEBAR))
    const observer = new MutationObserver((records) => {
      if (records.some((record) => {
        if (owned(record.target)) return false
        if (!inSidebar(record.target) && !(record.type === "childList" && [...record.addedNodes].some(bringsSidebar))) return false
        if (record.type === "attributes") return true
        return [...record.addedNodes, ...record.removedNodes].some((node) => !owned(node))
      })) refresh()
    })
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-tab-key", "data-orientation", "data-status"],
    })

    // One timer for every row; only while the window is visible.
    const ticker = createTicker({
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id),
      visible: () => document.visibilityState === "visible",
    }, refresh)
    const wake = () => ticker.wake()
    window.addEventListener("focus", wake)
    document.addEventListener("visibilitychange", wake)

    return () => {
      observer.disconnect()
      ticker.dispose()
      window.removeEventListener("focus", wake)
      document.removeEventListener("visibilitychange", wake)
      removeTimes(document)
      resizeObserver.disconnect()
      observed.clear()
      icons.forEach((dispose) => dispose())
      icons.clear()
      if (frame !== undefined) cancelAnimationFrame(frame)
      document.querySelectorAll("[data-sidebar-repo]").forEach((badge) => badge.remove())
      document.querySelectorAll("[data-sidebar-status-icon]").forEach((icon) => icon.remove())
      document
        .querySelectorAll("[data-sidebar-attention]")
        .forEach((element) => element.removeAttribute("data-sidebar-attention"))
    }
  },
})
