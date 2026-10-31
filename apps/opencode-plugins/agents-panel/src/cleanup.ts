import type { Context } from "@opencode/plugin/gui"

type Ctx = Pick<Context, "tabs" | "sessions" | "toast" | "storage" | "layout">
type Infos = { list?: () => readonly { id: string; parentID?: string }[] | undefined }

/**
 * Sidebar tabs of child sessions, which an older version of this plugin opened per subagent. Never the tab on screen
 * or the routed session's tab.
 */
export function strayTabs(ctx: Pick<Ctx, "tabs" | "sessions">) {
  const current = ctx.sessions.current()
  return ctx.tabs.list().filter((tab) => {
    const session = tab.session
    if (!session || tab.active || session.key === current?.key || tab.key === current?.tab) return false
    const infos = (session.server.data.session as unknown as Infos).list?.() ?? []
    return !!infos.find((info) => info.id === session.id)?.parentID
  })
}

/** Closes them as the user would (they list under Recently closed) and says how many went. */
export function closeSubagentTabs(ctx: Ctx) {
  const strays = strayTabs(ctx)
  for (const tab of strays) ctx.tabs.close(tab.key)
  const count = strays.length
  ctx.toast.show({
    title: count === 0 ? "No subagent tabs to close" : `Closed ${count} subagent ${count === 1 ? "tab" : "tabs"}`,
    description: count === 0 ? undefined : "They are in Recently closed.",
  })
  return count
}

/** Once per plugin load: closes strays when the tab strip is known, then never again, so a reload does nothing. */
export function cleanupOnce(ctx: Ctx) {
  const [state, setState] = ctx.storage.memory<{ done: boolean }>("cleanup", { initial: { done: false } })
  return () => {
    if (state.done) return
    // Before the layout loads and a tab is on screen, the viewed tab is not known yet, and it must never be closed.
    if (!ctx.layout.ready() || !ctx.tabs.list().some((tab) => tab.active)) return
    const tabs = ctx.tabs.list().filter((tab) => tab.session)
    if (tabs.length === 0) return
    // Child info loads with the session lists; wait until every tab's session is known before judging.
    const known = tabs.every((tab) => ((tab.session!.server.data.session as unknown as Infos).list?.() ?? []).some((info) => info.id === tab.session!.id))
    if (!known) return
    setState((draft) => {
      draft.done = true
    })
    if (strayTabs(ctx).length > 0) closeSubagentTabs(ctx)
  }
}
