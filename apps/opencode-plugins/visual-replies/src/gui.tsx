import { Panel, Plugin, Style, createKeyed, createLatest, type IconName } from "@opencode/plugin/gui"
import { Show, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { createAttacher, type ControlActions, type PageData } from "./attach"
import { createFrames } from "./frames"
import { readTheme } from "./frame"
import { entryOf, mapParts, type ArtifactInfo, type Placement, type Scan, type ToolPart } from "./ids"
import { vetoNavigation } from "./guard"
import css from "./style.css?inline"

/** A scan of the first page is enough to follow a live session; opening a session reads further back. */
const pageSize = 100
const deepPages = 6
/** At most one scan per second, however often the timeline mutates. */
const scanInterval = 1000

type Loaded = { title: string; html: string } | "gone"

export default Plugin.define({
  i18n: {
    en: {
      expand: "Expand",
      close: "Close",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      zoomReset: "Reset zoom",
      panel: "Open in panel",
      updated: "Updated",
      artifact: "Artifact",
      openLink: "Open this link in your browser?",
      open: "Open",
      gone: "This artifact was deleted.",
      failed: "Could not load this page.",
    },
  },
  /**
   * Stops a page navigating itself (every route, `<meta refresh>` included) before the request leaves. The renderer
   * cannot: Chromium implements no `navigate-to` and its Navigation API does not see meta refresh. Windows only.
   */
  main(ctx) {
    const watch = (window: { webContents: { on: (event: string, listener: (event: any) => void) => unknown; off: (event: string, listener: (event: any) => void) => unknown } }) => {
      const listener = (event: { url: string; isMainFrame: boolean; frame?: { url?: string }; preventDefault: () => void }) => {
        if (vetoNavigation({ url: event.url, isMainFrame: event.isMainFrame, frameUrl: event.frame?.url })) event.preventDefault()
      }
      window.webContents.on("will-frame-navigate", listener)
      ctx.onCleanup(() => {
        window.webContents.off("will-frame-navigate", listener)
      })
    }
    for (const window of ctx.windows.list()) watch(window)
    ctx.windows.on("open", watch)
  },
  setup(ctx) {
    ctx.add(Style, css)
    const doc = document
    const root = doc.documentElement
    const scanned: Scan = { placements: new Map(), settled: new Set() }
    const infos = new Map<string, ArtifactInfo>()
    const [versions, setVersions] = createStore<Record<string, number>>({})
    const [titles, setTitles] = createStore<Record<string, string>>({})
    let lastScan = Number.NEGATIVE_INFINITY
    let scanning: Promise<void> | undefined
    let pending = false

    const theme = () => {
      const style = getComputedStyle(root)
      return readTheme(ctx.appearance.mode(), (token) => style.getPropertyValue(token), {
        sans: getComputedStyle(doc.body).fontFamily,
        mono: ctx.appearance.font("mono"),
      })
    }
    const frames = createFrames({
      doc,
      theme,
      open: async (url) => {
        const ok = await ctx.dialogs.confirm({ title: ctx.t("openLink"), description: url.length > 300 ? `${url.slice(0, 300)}…` : url, confirm: ctx.t("open") })
        if (ok) ctx.system.openExternal(url)
        return ok
      },
    })

    const artifacts = () => ctx.client.experimental.artifacts

    /** The artifact's current page. "gone" when the host no longer has it; a failure to ask throws. */
    async function fetchArtifact(artifactID: string, signal?: AbortSignal): Promise<Loaded> {
      const result = await artifacts()
        .get({ artifactID }, { signal })
        .catch((error: { status?: number; _tag?: string }) => {
          if (error?.status === 404 || error?._tag === "ArtifactNotFoundError") return undefined
          throw error
        })
      const content = result?.data
      if (!content) return "gone"
      setTitles(artifactID, content.info.title)
      return { title: content.info.title, html: entryOf(content.files, content.info.entry) ?? "" }
    }

    /** A card shows the artifact now; when the agent has deleted it, the page its tool call carried. */
    async function load(placement: Placement): Promise<PageData | undefined> {
      if (placement.artifactID) {
        const page = await fetchArtifact(placement.artifactID, ctx.signal).catch(() => undefined)
        if (page && page !== "gone") return page
      }
      return placement.carried ? { title: placement.carried.title || placement.title || ctx.t("artifact"), html: placement.carried.html } : undefined
    }

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
            {actions.surface === "inline" && actions.panel ? button("sidebar", ctx.t("panel"), actions.panel) : null}
            {actions.surface === "inline"
              ? button("outline-expand", ctx.t("expand"), actions.primary)
              : button("close-small", ctx.t("close"), actions.primary)}
          </>
        ),
        container,
      )
    }

    const attacher = createAttacher({
      doc,
      frames,
      scan: () => scanned,
      load,
      updatedLabel: () => ctx.t("updated"),
      failedLabel: () => ctx.t("failed"),
      titleOf: (artifactID) => titles[artifactID] ?? infos.get(artifactID)?.title,
      mountControls,
      openPanel: (artifactID) => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.open(`${ctx.id}:${artifactID}`, session)
      },
      unknown: () => requestScan(false),
    })

    /** Reads the session's messages and artifacts and places what the agent published. */
    async function scan(sessionID: string, deep: boolean) {
      const parts: ToolPart[] = []
      let cursor: string | undefined
      for (let page = 0; page < (deep ? deepPages : 1); page++) {
        const result = await ctx.client.message.list({ sessionID, limit: pageSize, cursor }, { signal: ctx.signal })
        for (const message of result.data) {
          const content = (message as { content?: unknown }).content
          if (Array.isArray(content)) for (const part of content) if (part?.type === "tool") parts.push(part as ToolPart)
        }
        cursor = result.cursor?.next ?? undefined
        if (!cursor || result.data.length < pageSize) break
      }
      const listed = await artifacts().list({ sessionID }, { signal: ctx.signal })
      const found = listed.data as readonly ArtifactInfo[]
      const next = mapParts(parts, found)
      for (const [callID, placements] of next.placements) scanned.placements.set(callID, placements)
      for (const callID of next.settled) scanned.settled.add(callID)
      for (const info of found) {
        infos.set(info.id, info)
        const before = versions[info.id]
        if (before === info.time.updated) continue
        setVersions(info.id, info.time.updated)
        if (before !== undefined) void attacher.refresh(info.id)
      }
      attacher.scan()
    }

    function requestScan(deep: boolean) {
      const session = ctx.sessions.current()
      if (!session) return
      if (scanning) {
        pending = true
        return
      }
      const wait = Math.max(0, lastScan + scanInterval - Date.now())
      scanning = new Promise<void>((resolve) => setTimeout(resolve, wait))
        .then(() => {
          lastScan = Date.now()
          return scan(session.id, deep)
        })
        .catch((error) => {
          if (!ctx.signal.aborted) console.warn("visual-replies: scan failed:", error)
        })
        .finally(() => {
          scanning = undefined
          if (pending) {
            pending = false
            requestScan(false)
          }
        })
    }

    createKeyed(
      () => ctx.sessions.current()?.id,
      () => requestScan(true),
    )

    createKeyed(
      () => ctx.appearance.mode(),
      () => {
        const frame = requestAnimationFrame(() => frames.refreshTheme())
        onCleanup(() => cancelAnimationFrame(frame))
      },
    )

    // The app's colour theme can change without the mode changing; its tokens move on the root element.
    const themeObserver = new MutationObserver(() => frames.refreshTheme())
    themeObserver.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-color-scheme"] })

    const tabs = new Map<string, { readonly id: string; readonly title: string }>()
    ctx.add(Panel, {
      id: "view",
      region: "side",
      list: ({ open }) =>
        open.map((id) => {
          const existing = tabs.get(id)
          if (existing) return existing
          const tab = {
            id,
            get title() {
              return titles[id] ?? ctx.t("artifact")
            },
          }
          tabs.set(id, tab)
          return tab
        }),
      render: (props) => {
        const key = () => `${versions[props.tab.id] ?? 0}@${props.tab.id}`
        const page = createLatest(key, (value, signal) => fetchArtifact(value.slice(value.indexOf("@") + 1), signal))
        let host: HTMLDivElement | undefined
        createKeyed(
          () => {
            const loaded = page.latest
            return loaded && loaded !== "gone" ? loaded : undefined
          },
          (loaded) => {
            const view = frames.create({ group: props.tab.id, html: loaded.html, surface: "panel", title: loaded.title })
            host?.replaceChildren(view.frame)
            onCleanup(() => frames.retire(view))
          },
        )
        return (
          <div data-visual-reply-panel ref={host}>
            <Show when={page.error || page.latest === "gone"}>
              <div data-slot="error">{page.latest === "gone" ? ctx.t("gone") : ctx.t("failed")}</div>
            </Show>
          </div>
        )
      },
    })

    onCleanup(() => {
      themeObserver.disconnect()
      attacher.dispose()
      frames.dispose()
    })
  },
})
