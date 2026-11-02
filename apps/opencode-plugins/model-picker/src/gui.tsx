import { createKeyed, Plugin, Style } from "@opencode/plugin/gui"
import { createMemo, onCleanup } from "solid-js"
import { outputPrice, parseRank } from "./layout"
import { attach, type Pane } from "./pane"

// The host dialog's own results list is hidden while the plugin's pane is up.
const css = `[data-slot="search-list-body"][data-mp-hidden] { display: none !important; }`
const DIALOG = ".model-dialog"
// The app renders into #root; dialogs portal to their own container beside it. Only those containers are watched, so
// nothing in the app (a streaming reply) wakes the observer. If the host portals dialogs elsewhere, nothing mounts and
// the host's own picker stays as it is.
const APP = "#root"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, css)
    const rank = parseRank((ctx.options as { rank?: unknown } | undefined)?.rank)

    const target = createMemo(() => {
      const session = ctx.sessions.current()
      const server = session?.server ?? ctx.servers.get(ctx.servers.list()[0] ?? "")
      if (!server) return undefined
      const directory = session?.location?.directory ?? server.data.project.list()[0]?.canonical
      if (directory === undefined) return undefined
      return { server, ref: session?.location ?? { directory } }
    })
    // One fetch per server and location until the list is loaded.
    createKeyed(
      target,
      ({ server, ref }) => {
        if (!server.data.location.model.list(ref)) void server.data.location.model.sync(ref).catch(() => undefined)
      },
      { equals: (a, b) => a.server === b.server && a.ref.directory === b.ref.directory },
    )
    const prices = createMemo<ReadonlyMap<string, number>>(() => {
      const now = target()
      const models = now?.server.data.location.model.list(now.ref)
      return new Map((models ?? []).map((model) => [`${model.providerID}:${model.modelID}`, outputPrice(model.cost)]))
    })

    const panes = new Map<Element, Pane>()
    const mount = (dialog: Element) => {
      if (panes.has(dialog) || !(dialog instanceof HTMLElement)) return
      const pane = attach(dialog, { price: prices, rank })
      if (pane) panes.set(dialog, pane)
    }
    createKeyed(prices, () => {
      for (const pane of panes.values()) pane.refresh()
    })

    const scan = (node: Node) => {
      if (!(node instanceof Element)) return
      const inside = node.closest(DIALOG)
      if (inside) return mount(inside)
      for (const dialog of node.querySelectorAll(DIALOG)) mount(dialog)
    }
    const sweep = () => {
      for (const [dialog, pane] of panes) if (!dialog.isConnected) (pane.dispose(), panes.delete(dialog))
    }
    const containers = new Map<Element, MutationObserver>()
    const watch = (container: Element) => {
      if (containers.has(container) || container.matches(APP)) return
      const observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) scan(node)
        sweep()
      })
      observer.observe(container, { childList: true, subtree: true })
      containers.set(container, observer)
      scan(container)
    }
    const unwatch = () => {
      for (const [container, observer] of containers) if (!container.isConnected) (observer.disconnect(), containers.delete(container))
    }
    const body = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) watch(node)
      unwatch()
      sweep()
    })
    body.observe(document.body, { childList: true })
    for (const child of document.body.children) watch(child)

    onCleanup(() => {
      body.disconnect()
      for (const observer of containers.values()) observer.disconnect()
      containers.clear()
      for (const pane of panes.values()) pane.dispose()
      panes.clear()
    })
  },
})
