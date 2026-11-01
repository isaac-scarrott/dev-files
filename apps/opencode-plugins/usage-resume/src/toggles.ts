import type { Plugin } from "@opencode/plugin"

export type Storage = Pick<Plugin.Context["storage"], "get" | "set">

interface DefaultValue {
  enabled: boolean
  /** When the default was last turned on, epoch ms. A session without its own entry follows the default only if it was created after. */
  since: number
}

const DEFAULT_KEY = "toggle/default"
const sessionKey = (id: string) => `toggle/session/${id}`

/**
 * Auto-resume is opt-in. A session resumes only when its own toggle is on; the global default decides what a NEW session
 * starts with, and the session's own choice, once made, always wins. Subagents (sessions with a parent) are never on.
 */
export class Toggles {
  constructor(
    private readonly storage: Storage,
    private readonly now: () => number,
  ) {}

  async default(): Promise<DefaultValue> {
    const stored = (await this.storage.get(DEFAULT_KEY).catch(() => undefined)) as Partial<DefaultValue> | undefined
    return { enabled: stored?.enabled === true, since: typeof stored?.since === "number" ? stored.since : 0 }
  }

  async setDefault(enabled: boolean): Promise<void> {
    const current = await this.default()
    if (current.enabled === enabled) return
    await this.storage.set(DEFAULT_KEY, { enabled, since: enabled ? this.now() : current.since })
  }

  /** The session's own choice, if it has made one or was created while the default was on. */
  async own(sessionID: string): Promise<boolean | undefined> {
    const stored = (await this.storage.get(sessionKey(sessionID)).catch(() => undefined)) as { enabled?: unknown } | undefined
    return typeof stored?.enabled === "boolean" ? stored.enabled : undefined
  }

  async set(sessionID: string, enabled: boolean): Promise<void> {
    await this.storage.set(sessionKey(sessionID), { enabled })
  }

  /** A session was created: it starts with the default as it is now. Keeps an existing choice. */
  async seed(sessionID: string): Promise<void> {
    if ((await this.own(sessionID)) !== undefined) return
    const value = await this.default()
    if (value.enabled) await this.set(sessionID, true)
  }

  /** Whether the session may be resumed. `created` is the session's creation time, for sessions seen before they were seeded. */
  async effective(sessionID: string, root: boolean, created: number): Promise<{ on: boolean; why: string }> {
    if (!root) return { on: false, why: "subagent" }
    const own = await this.own(sessionID)
    if (own !== undefined) return { on: own, why: own ? "session toggle on" : "session toggle off" }
    const value = await this.default()
    if (value.enabled && created >= value.since) return { on: true, why: "global default on" }
    return { on: false, why: "toggle off (no choice made, default off)" }
  }
}
