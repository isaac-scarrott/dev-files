import { Command, Plugin } from "@opencode/plugin/gui"
import { NAME, readme, scratchDirectory } from "./scratch"

export default Plugin.define({
  i18n: {
    en: {
      title: "New session without a project",
      description: "Start in an empty folder: no repository, AGENTS.md or project config",
      failed: "Could not start a session without a project",
    },
  },
  setup(ctx) {
    const open = async () => {
      const server = ctx.sessions.current()?.server ?? ctx.servers.list().map((id) => ctx.servers.get(id)).find((item) => item?.builtin)
      if (!server) return
      const { client } = server
      const home = (await client.location.get(undefined, { signal: ctx.signal })).directory
      const directory = scratchDirectory(home, ctx.options.directory)
      const path = `${directory}/README.md`

      // The server accepts a missing directory but its tools then fail. A write by absolute path from the default
      // location creates the folder; a location that does not exist yet cannot be written through.
      const exists = await client.file.read({ path }, { signal: ctx.signal }).then(() => true, () => false)
      if (!exists) await client.experimental.file.write({ path, payload: readme() }, { signal: ctx.signal })

      ctx.layout.draft({ server: server.id, directory, prompt: "" })
    }

    ctx.add(Command, {
      id: "new",
      title: ctx.t("title"),
      description: ctx.t("description"),
      keywords: `${NAME} projectless scratch empty`,
      section: "general",
      slash: { name: "no-project" },
      featured: true,
      run: () => open().catch((error: unknown) => {
        if (ctx.signal.aborted) return
        console.warn("no-project:", error)
        ctx.toast.show({ title: ctx.t("failed"), variant: "error" })
      }),
    })
  },
})
