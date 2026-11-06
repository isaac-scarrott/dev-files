import type { SetupContext } from "@opencode/plugin/gui"

// Only the members each helper reads: a plugin's context type comes from its own copy of the SDK, and the whole
// `SetupContext` is nominal (its `provide` carries the SDK's tokens), so the slice is what crosses the package boundary.
type Part<K extends keyof SetupContext<any>> = Pick<SetupContext<any>, K>
import { avatarFor, type Avatar } from "./avatar"

export interface Target { server: string; id: string }

export const sessionKey = (server: string, id: string) => `${server}\n${id}`

// A prompt the user typed: composer, queued or steering send, slash command. The composer stamps `payload.metadata.displayText`
// (OpenCode 2.2.5, read off real sends: also on slash commands, where it is the "/command args" line). Peer messages, monitor
// and scheduler wakes are user-typed inbox items too, but they stamp their own keys and no `displayText`, and a client that
// calls the prompt API directly stamps nothing. Only the composer's stamp counts, so a sender we do not know is not the user.
export function isUserSend(item: { type?: string; payload?: object } | undefined) {
  const metadata = (item?.payload as { metadata?: Record<string, unknown> } | undefined)?.metadata
  return item?.type === "user" && typeof metadata?.displayText === "string"
}

// The session behind a vertical tab, for the tab actions, the woke mark and the archived sweep. `pending` is the tab's own
// flag; each plugin adds what else makes it disabled for its action.
export interface TabSession { target: Target; title: string; pending: boolean; archived: boolean }

export function tabSession(ctx: Part<"tabs">, key: string): TabSession | undefined {
  const session = ctx.tabs.list().find((tab) => tab.key === key)?.session
  if (!session) return
  const info = session.server.data.session.get(session.id)
  return {
    target: { server: session.server.id, id: session.id },
    title: info?.title ?? "",
    pending: !!session.pending,
    archived: info?.time?.archived !== undefined,
  }
}

// Cold stores may lack the session or its project; the letter then falls back to the fallback name. Same label as the live
// rows (sidebar-repos): the project's name, falling back to the folder name.
export function repoLabel(ctx: Part<"servers">, server: string, info: { projectID?: string; location?: { directory: string } } | undefined, fallback = "") {
  const data = ctx.servers.get(server)?.data
  const directory = info?.location?.directory ?? fallback
  let canonical: string | undefined
  try { canonical = info?.projectID ? data?.project.get(info.projectID)?.canonical : undefined } catch {}
  const path = canonical ?? directory
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || path
}

export function avatarOf(ctx: Part<"servers">, server: string, info: { projectID?: string; location?: { directory: string } } | undefined, fallback = ""): Avatar {
  return avatarFor(info?.projectID ? ctx.servers.get(server)?.data.project?.get(info.projectID) : undefined, info?.location?.directory ?? fallback)
}
