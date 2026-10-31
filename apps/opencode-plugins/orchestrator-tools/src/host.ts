import type { Plugin } from "@opencode/plugin"

/** The slice of the plugin context the orchestrator uses; tests supply a fake. */
export type Host = Pick<Plugin.Context, "session" | "event" | "storage" | "permission">

export type SessionInfo = Awaited<ReturnType<Host["session"]["get"]>>
export type MessageInfo = Awaited<ReturnType<Host["session"]["context"]>>[number]
