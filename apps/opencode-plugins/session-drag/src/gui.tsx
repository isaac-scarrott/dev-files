import { Command, LinkHandler, Plugin, Style, type Context, type SessionRef } from "@opencode/plugin/gui"
import { onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { installSessionDrag } from "./drag"
import { ICON, ORIGIN, note, parseHref, rowRef, rowTitle, type SessionTarget } from "./reference"
import { styles } from "./styles"

const title = (ctx: Context, server: string, id: string) => ctx.servers.get(server)?.data.session.get(id)?.title

const target = (ctx: Context, session: SessionRef, fallback = session.id): SessionTarget => ({
  server: session.server.id,
  id: session.id,
  title: title(ctx, session.server.id, session.id) ?? fallback,
})

/** A live tab row names a shell tab; a snooze-archive row carries its server and session id. */
function resolveRow(ctx: Context, row: HTMLElement): SessionTarget | undefined {
  const ref = rowRef(row)

  if (!ref) return

  if (ref.kind === "archive") return { server: ref.server, id: ref.id, title: title(ctx, ref.server, ref.id) ?? rowTitle(row) }
  const session = ctx.tabs.list().find((tab) => tab.key === ref.key)?.session

  if (!session) return

  return target(ctx, session, rowTitle(row) || session.id)
}

function attach(ctx: Context, value: SessionTarget) {
  const composer = ctx.screen.current()?.composer

  if (!composer) return false
  composer.attach(note(value))
  composer.focus()

  return true
}

/** The host's dropzone overlay covers each session panel; a drop counts inside the panel it covers. */
const dropzones = () =>
  Array.from(document.querySelectorAll('[data-slot="session-dropzone-blur"]')).flatMap((blur) =>
    blur.parentElement ? [blur.parentElement] : [],
  )

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, styles)

    ctx.add(LinkHandler, {
      match: (link) => link.origin === ORIGIN && !!parseHref(link.href),
      open: (link) => {
        const ref = parseHref(link.href)

        if (ref) ctx.tabs.open({ server: ref.server, id: ref.id }, { focus: true })
      },
    })

    ctx.add(Command, (): Command => ({
      id: "reference",
      title: "Reference session…",
      description: "Attach another session to the prompt, by id and title",
      keywords: "session reference mention link drag",
      section: "prompt",
      enabled: !!ctx.screen.current(),
      run: async () => {
        const current = ctx.sessions.current()?.id

        const options = ctx.sessions
          .list()
          .filter((session) => session.id !== current)
          .map((session) => ({
            title: title(ctx, session.server.id, session.id) ?? session.id,
            description: session.location?.directory,
            value: session,
          }))

        if (!options.length) return

        const pick = await ctx.dialogs.select({ title: "Reference session", placeholder: "Search sessions…", options })

        if (pick) attach(ctx, target(ctx, pick))
      },
    }))

    onCleanup(
      installSessionDrag({
        resolve: (row) => resolveRow(ctx, row),
        drop: (value) => void attach(ctx, value),
        dropzones,
        icon: (into) => render(() => <ctx.ui.Icon name={ICON} size="small" class="text-v2-icon-icon-muted" />, into),
      }),
    )
  },
})
