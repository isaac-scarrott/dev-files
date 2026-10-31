import { Command, Plugin } from "@opencode/plugin/gui"
import { onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { attachPicker } from "./picker"
import { NAME, readme, scratchDirectory } from "./scratch"

const EDITOR = '[data-component="composer-editor"]'

export default Plugin.define({
  i18n: {
    en: {
      title: "New session without a project",
      description: "Start in an empty folder: no repository, AGENTS.md or project config",
      scratch: "Scratch folder",
      failed: "Could not start a session without a project",
    },
  },
  setup(ctx) {
    // The picker chooses where the draft it was opened from runs. The app gives plugins no way to retarget that draft,
    // so the draft is reopened in the scratch folder in its place, with its prompt text, and the old tab is closed
    // (it stays under recently closed tabs).
    const reopen = (origin: { key: string } | undefined, known: Set<string>, frames = 30) => {
      if (!origin) return
      const tab = ctx.tabs.list().find((item) => !known.has(item.key))
      if (!tab) {
        if (frames > 0 && !ctx.signal.aborted) requestAnimationFrame(() => reopen(origin, known, frames - 1))
        return
      }
      const index = ctx.tabs.list().findIndex((item) => item.key === origin.key)
      if (index >= 0) ctx.tabs.move(tab.key, index)
      ctx.tabs.close(origin.key)
    }

    const serverRef = () => ctx.sessions.current()?.server ?? ctx.servers.list().map((id) => ctx.servers.get(id)).find((item) => item?.builtin)
    const folder = async (server: NonNullable<ReturnType<typeof serverRef>>) =>
      scratchDirectory((await server.client.location.get(undefined, { signal: ctx.signal })).directory, ctx.options.directory)
    let scratch: string | undefined

    const open = async (replace = false) => {
      const origin = replace ? ctx.tabs.list().find((item) => item.active && !item.session) : undefined
      const prompt = origin ? (document.querySelector<HTMLElement>(EDITOR)?.innerText ?? "").trim() : ""
      const server = serverRef()
      if (!server) return
      const { client } = server
      const directory = await folder(server)
      const path = `${directory}/README.md`

      // The server accepts a missing directory but its tools then fail. A write by absolute path from the default
      // location creates the folder; a location that does not exist yet cannot be written through.
      const exists = await client.file.read({ path }, { signal: ctx.signal }).then(() => true, () => false)
      if (!exists) await client.experimental.file.write({ path, payload: readme() }, { signal: ctx.signal })

      const before = new Set(ctx.tabs.list().map((item) => item.key))
      ctx.layout.draft({ server: server.id, directory, prompt })
      reopen(origin, before)
    }

    const fail = (error: unknown) => {
      if (ctx.signal.aborted) return
      console.warn("no-project:", error)
      ctx.toast.show({ title: ctx.t("failed"), variant: "error" })
    }

    const builtin = ctx.servers.list().map((id) => ctx.servers.get(id)).find((item) => item?.builtin)
    if (builtin) void folder(builtin).then((directory) => { scratch = directory }, () => {})

    const icons: (() => void)[] = []
    const stop = attachPicker(document, {
      title: NAME,
      description: ctx.t("scratch"),
      path: () => scratch,
      keywords: ["scratch", "none", "without", "empty", "projectless"],
      icon: () => {
        const host = document.createElement("div")
        icons.push(render(() => ctx.ui.Icon({ name: "folder", class: "command-palette-row-icon" }), host))
        return host.firstElementChild ?? undefined
      },
      onSelect: () => void open(true).catch(fail),
    })
    onCleanup(() => { stop(); icons.forEach((dispose) => dispose()) })

    ctx.add(Command, {
      id: "new",
      title: ctx.t("title"),
      description: ctx.t("description"),
      keywords: `${NAME} projectless scratch empty`,
      section: "general",
      slash: { name: "no-project" },
      featured: true,
      run: () => open().catch(fail),
    })
  },
})
