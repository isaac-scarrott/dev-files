import type { Context } from "@opencode/plugin/gui"

type Ctx = Pick<Context, "tabs" | "sessions" | "toast">
type Infos = { list?: () => readonly { id: string; parentID?: string }[] | undefined }

/**
 * Sidebar tabs of child sessions, which an older version of this plugin opened per subagent, closed by the command only. Never the tab on screen
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

