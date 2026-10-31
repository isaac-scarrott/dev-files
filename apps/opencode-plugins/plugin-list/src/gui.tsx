import { Plugin } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { config } from "./main"
import { PluginConfig } from "./contract"
import { entries, type Entry, type PluginInfo } from "./entries"
import { cleanup, sync } from "./rows"

const PANEL = '[role="tabpanel"][id$="content-plugins"], [data-slot="tabs-v2-content"][data-value="plugins"]'
// The config watcher reloads a plugin when its entry changes, so Reload turns it off and on with a pause between.
const RELOAD_GAP = 700
const SETTLE = 900

export default Plugin.define({
  setup(ctx) {
    let list: Entry[] = []
    let loading = false
    let frame: number | undefined
    const timers = new Set<ReturnType<typeof setTimeout>>()

    const load = async () => {
      if (loading) return
      loading = true
      try {
        const server = ctx.servers.list().map((id) => ctx.servers.get(id)).find((item) => item?.builtin)
        const result = (await server?.client.plugin.list()) as unknown
        const plugins = (Array.isArray(result) ? result : (result as { data?: unknown } | undefined)?.data) as PluginInfo[] | undefined
        const disabled = await ctx.main(PluginConfig).disabled().catch(() => [] as readonly string[])
        list = entries(plugins ?? [], disabled)
      } catch (error) {
        console.warn("plugin-list: could not load plugins", error)
      } finally {
        loading = false
        refresh()
      }
    }

    const later = (ms: number, run: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        run()
      }, ms)
      timers.add(timer)
    }

    const fail = (error: unknown) => {
      console.warn("plugin-list: could not change plugin", error)
      ctx.toast.show({ title: "Could not change plugin", variant: "error" })
    }
    const set = (name: string, enabled: boolean) => ctx.main(PluginConfig).set({ name, enabled })

    const mount = (container: HTMLElement, entry: Entry) => {
      const [enabled, setEnabled] = createSignal(entry.enabled)
      const [busy, setBusy] = createSignal(false)
      const settle = () => later(SETTLE, () => { setBusy(false); void load() })
      const toggle = (next: boolean) => {
        setEnabled(next)
        setBusy(true)
        set(entry.name, next).then(settle, (error: unknown) => { setEnabled(!next); setBusy(false); fail(error) })
      }
      const reload = () => {
        setBusy(true)
        set(entry.name, false).then(
          () => later(RELOAD_GAP, () => void set(entry.name, true).then(settle, (error: unknown) => { setBusy(false); fail(error) })),
          (error: unknown) => { setBusy(false); fail(error) },
        )
      }
      return render(() => (
        <>
          <ctx.ui.Button size="small" variant="ghost" disabled={busy() || !enabled()} onClick={reload}>Reload</ctx.ui.Button>
          <ctx.ui.Switch hideLabel label={entry.name} checked={enabled()} disabled={busy()} onChange={toggle} />
        </>
      ), container)
    }

    const refresh = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        const panel = document.querySelector(PANEL)
        if (panel) sync(document, panel, list, mount)
      })
    }

    let open = false
    const observer = new MutationObserver((records) => {
      const own = (node: Node) => !!(node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest("[data-plugin-list-row], [data-plugin-list]")
      if (!records.some((record) => ![record.target, ...record.addedNodes, ...record.removedNodes].every(own))) return
      const present = !!document.querySelector(PANEL)
      if (present && !open) void load()
      open = present
      refresh()
    })
    observer.observe(document.documentElement, { subtree: true, childList: true })

    return () => {
      observer.disconnect()
      timers.forEach(clearTimeout)
      if (frame !== undefined) cancelAnimationFrame(frame)
      cleanup(document)
    }
  },
  main(ctx) {
    ctx.provide(PluginConfig, config)
  },
})
