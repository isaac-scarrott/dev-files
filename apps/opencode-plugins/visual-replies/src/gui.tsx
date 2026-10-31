import { Plugin, Style, type IconName } from "@opencode/plugin/gui"
import { createEffect, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { createAttacher, type ControlActions } from "./attach"
import { readTheme } from "./frame"
import { VisualReplies } from "./rpc"
import { css } from "./style"

interface PageOut {
  title: string
  html: string
}
interface ListOut {
  pages: { callID: string }[]
}

export default Plugin.define({
  i18n: {
    en: {
      expand: "Expand",
      close: "Close",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoomReset: "Reset zoom",
    },
  },
  setup(ctx) {
    ctx.add(Style, css)
    const known = new Set<string>()
    const listed = new Set<string>()
    const doc = document
    const root = doc.documentElement
    const rpc = () => ctx.client.rpc(VisualReplies)

    const theme = () => {
      const style = getComputedStyle(root)
      return readTheme(ctx.appearance.mode(), (token) => style.getPropertyValue(token), {
        sans: getComputedStyle(doc.body).fontFamily,
        mono: ctx.appearance.font("mono"),
      })
    }

    // The buttons are the app's own; only the sandboxed frame and its placement are ours.
    const mountControls = (container: HTMLElement, actions: ControlActions) => {
      const button = (icon: IconName, label: string, run: () => void) => (
        <ctx.ui.Tooltip value={label} placement="bottom">
          <ctx.ui.IconButton icon={icon} label={label} size="small" onClick={run} />
        </ctx.ui.Tooltip>
      )
      return render(
        () => (
          <>
            {button("outline-magnifier-minus", ctx.t("zoomOut"), actions.zoomOut)}
            {button("outline-reset", ctx.t("zoomReset"), actions.zoomReset)}
            {button("outline-magnifier-plus", ctx.t("zoomIn"), actions.zoomIn)}
            {actions.surface === "inline"
              ? button("outline-expand", ctx.t("expand"), actions.primary)
              : button("close-small", ctx.t("close"), actions.primary)}
          </>
        ),
        container,
      )
    }

    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const attacher = createAttacher({
      doc,
      known: () => known,
      theme,
      mountControls,
      openExternal: (url) => ctx.system.openExternal(url),
      load: async (callID) => {
        const page = (await rpc()
          .get({ callID }, { signal: ctx.signal })
          .catch(() => undefined)) as PageOut | undefined
        return page ? { title: page.title, html: page.html } : undefined
      },
      unknown: () => {
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => loadSessions(true), 250)
      },
    })

    async function loadSession(sessionID: string) {
      try {
        const { pages } = (await rpc().list({ sessionID }, { signal: ctx.signal })) as ListOut
        for (const page of pages) known.add(page.callID)
        listed.add(sessionID)
        attacher.scan()
      } catch {
        // Server unreachable or plugin not loaded there; the next unknown id retries.
      }
    }

    function loadSessions(all: boolean) {
      for (const session of ctx.sessions.list()) if (all || !listed.has(session.id)) void loadSession(session.id)
    }

    createEffect(() => {
      ctx.sessions.list()
      loadSessions(false)
    })

    createEffect(() => {
      ctx.appearance.mode()
      requestAnimationFrame(() => attacher.refreshTheme())
    })

    const themeObserver = new MutationObserver(() => attacher.refreshTheme())
    themeObserver.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-color-scheme"] })

    createEffect(() => {
      const off = rpc().events.on("published", (event) => {
        const data = event.data as { callID: string; sessionID: string }
        known.add(data.callID)
        listed.add(data.sessionID)
        attacher.recheck([data.callID])
      })
      onCleanup(off)
    })

    return () => {
      clearTimeout(refreshTimer)
      themeObserver.disconnect()
      attacher.dispose()
    }
  },
})
