import { LinkHandler, Plugin, type Link } from "@opencode/plugin/gui"
import { FileViewerRpc } from "./rpc.js"
import { claim } from "./expand"
import { createLinks } from "./links"
import { watchSpacedCode } from "./spaced-code"

/**
 * Opens the paths the host does not: `~/...` (it refuses them) and names with spaces (its inline code check rejects them).
 * Everything else is declined, so the host's own handler, fuzzy workspace search included, behaves exactly as before.
 * The existing file is handed back to the host through `ctx.links.open`, which opens the Files plugin's side-panel tab.
 */
export default Plugin.define({
  setup(ctx) {
    const homes = new Map<string, Promise<string | undefined>>()

    const links = createLinks({
      files: (link) => {
        const session = ctx.sessions.current()
        const files = ctx.screen.current()?.file

        if (!session || !files || (link.session && link.session.key !== session.key)) return

        return { root: files.root, exists: (path) => files.exists(path), resolve: (path) => files.resolve(path), local: session.server.local }
      },
      home: () => {
        const server = ctx.sessions.current()?.server.id ?? ""
        const known = homes.get(server)

        if (known) return known

        // One lookup per server; a failure is forgotten so the next link asks again.
        const asked = ctx.client
          .rpc(FileViewerRpc)
          .home({}, { signal: ctx.signal })
          .then((reply) => (reply as { home: string }).home)
          .catch(() => {
            homes.delete(server)
            return undefined
          })

        homes.set(server, asked)

        return asked
      },
      hostExists: (href) => ctx.links.exists({ href, origin: ctx.id }),
      now: () => Date.now(),
    })

    ctx.add(LinkHandler, {
      // Above the Files plugin (0) and Review (1), which match by origin.
      priority: 5,
      // Links we pass back carry our origin and go to the host. The palette and agent previews name exact files.
      match: (link: Link) => link.origin !== ctx.id && !link.exact && !link.background && !link.base && links.match(link.href),
      async exists(link: Link) {
        if (await links.target(link.href, link)) return true

        return ctx.links.exists({ ...link, origin: ctx.id })
      },
      open(link: Link) {
        void links.target(link.href, link).then((href) => {
          ctx.links.open({ ...link, href: href ?? link.href, origin: ctx.id })
        })
      },
    })

    // Workaround for names with spaces, which the host never offers to a LinkHandler (see DESIGN.md).
    const stop = watchSpacedCode(document, {
      target: (href) => links.target(href),
      peek: (href) => links.peek(href),
      open: (href) => void ctx.links.open({ href }),
    })

    return () => {
      stop()
      links.clear()
    }
  },
})

export { claim }
