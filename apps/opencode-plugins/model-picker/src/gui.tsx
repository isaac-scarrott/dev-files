import { Plugin, Style } from "@opencode/plugin/gui"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { outputPrice } from "./layout"
import { attach, type Pane } from "./pane"

// The host dialog's own results list is hidden while the plugin's pane is up.
const css = `[data-slot="search-list-body"][data-mp-hidden] { display: none !important; }`
const DIALOG = ".model-dialog"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, css)

    const [prices, setPrices] = createSignal<ReadonlyMap<string, number>>(new Map())
    createEffect(() => {
      const session = ctx.sessions.current()
      const server = session?.server ?? ctx.servers.get(ctx.servers.list()[0] ?? "")
      if (!server) return
      const directory = session?.location?.directory ?? server.data.project.list()[0]?.canonical
      if (directory === undefined) return
      const ref = session?.location ?? { directory }
      const models = server.data.location.model.list(ref)
      if (!models) {
        void server.data.location.model.sync(ref).catch(() => undefined)
        return
      }
      setPrices(new Map(models.map((model) => [`${model.providerID}:${model.modelID}`, outputPrice(model.cost)])))
    })

    const panes = new Map<Element, Pane>()
    const mount = (dialog: Element) => {
      if (panes.has(dialog) || !(dialog instanceof HTMLElement)) return
      const pane = attach(dialog, { price: prices })
      if (pane) panes.set(dialog, pane)
    }
    createEffect(() => {
      prices()
      for (const pane of panes.values()) pane.refresh()
    })

    const scan = (node: Node) => {
      if (!(node instanceof Element)) return
      const inside = node.closest(DIALOG)
      if (inside) return mount(inside)
      for (const dialog of node.querySelectorAll(DIALOG)) mount(dialog)
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) scan(node)
      for (const [dialog, pane] of panes) if (!dialog.isConnected) (pane.dispose(), panes.delete(dialog))
    })
    observer.observe(document.body, { childList: true, subtree: true })
    for (const dialog of document.querySelectorAll(DIALOG)) mount(dialog)

    onCleanup(() => {
      observer.disconnect()
      for (const pane of panes.values()) pane.dispose()
      panes.clear()
    })
  },
})
