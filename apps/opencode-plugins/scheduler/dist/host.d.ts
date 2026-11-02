import type { Plugin } from "@opencode/plugin";
/** The slice of the plugin context the scheduler uses; tests supply a fake. */
export type Host = Pick<Plugin.Context, "session" | "storage">;
export type SessionInfo = Awaited<ReturnType<Host["session"]["get"]>>;
