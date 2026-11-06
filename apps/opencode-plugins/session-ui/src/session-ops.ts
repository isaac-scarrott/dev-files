import type { ServerRef, SetupContext } from "@opencode/plugin/gui"

type Part<K extends keyof SetupContext<any>> = Pick<SetupContext<any>, K>

export const ARCHIVE_LABEL = "Archive"
export const DELETE_LABEL = "Delete…"
export const archiveLabels = { archive: ARCHIVE_LABEL, delete: DELETE_LABEL }

type DedicatedCall = (input: { sessionID: string }, options: { signal: AbortSignal }) => Promise<unknown>

// The host's own call when its client has one (2.2.5 does not: only session.update({ archived })), else the update. The
// dedicated call's argument shape is unverified, so a call that fails falls back to the update; the state is verified after.
export async function writeArchived(server: ServerRef, id: string, archived: boolean, signal: AbortSignal) {
  const session = server.client.session as unknown as Record<string, unknown>
  const dedicated = session[archived ? "archive" : "unarchive"]
  if (typeof dedicated === "function") {
    try { await (dedicated as DedicatedCall).call(session, { sessionID: id }, { signal }); return "dedicated" as const } catch (cause) { if (signal.aborted) throw cause }
  }
  await server.client.session.update({ sessionID: id, archived }, { signal })
  return "update" as const
}

export async function setArchived(server: ServerRef, id: string, archived: boolean, signal: AbortSignal) {
  await writeArchived(server, id, archived, signal)
  const info = await server.client.session.get({ sessionID: id }, { signal })
  if ((info.time.archived !== undefined) !== archived) throw new Error("Server did not confirm archive state")
  return info
}

// Native permanent delete; works for archived sessions too, which are ordinary stored sessions.
export async function removeSession(server: ServerRef, id: string, signal: AbortSignal) {
  await server.client.session.remove({ sessionID: id }, { signal })
}

export function toastError(ctx: Part<"toast">, cause: unknown) {
  ctx.toast.show({ title: "Session action failed", description: String(cause), variant: "error" })
}

// Asks first and says it cannot be undone. `keep` names what the user can do instead (archive it, snooze it).
// Resolves true when the session was deleted.
export async function deleteSession(
  ctx: Part<"servers" | "dialogs" | "signal">,
  server: ServerRef,
  id: string,
  options: { keep: string; done?(): void },
): Promise<boolean> {
  const title = server.data.session.get(id)?.title ?? "this session"
  const confirmed = await ctx.dialogs.confirm({
    title: `Delete “${title}” permanently?`,
    description: `This permanently deletes the session and its history from ${server.name}. It cannot be undone. To keep it, ${options.keep} instead.`,
    confirm: "Delete permanently", danger: true,
  })
  if (!confirmed) return false
  await removeSession(server, id, ctx.signal)
  options.done?.()
  return true
}
