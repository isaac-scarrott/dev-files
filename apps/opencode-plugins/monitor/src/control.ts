import type { Monitors } from "./manager.js"

/** One monitor as the composer chip lists it: a name and numbers, never a command or output. */
export interface MonitorItem {
  readonly id: string
  readonly name: string
  readonly state: "running" | "waiting" | "paused"
  readonly events: number
  readonly maxEvents?: number
  readonly expiresAt: number
  readonly nextRearmAt?: number
}

/** The handlers behind the desktop row's Stop button and the composer chip. A monitor belongs to one session, and only that session's row may stop it. */
export function monitorControl(monitors: Pick<Monitors, "list" | "stop">) {
  return {
    running: async (input: { ids: readonly string[] }): Promise<{ ids: string[] }> => {
      const wanted = new Set(input.ids)
      return { ids: monitors.list().filter((monitor) => wanted.has(monitor.id)).map((monitor) => monitor.id) }
    },
    list: async (input: { sessionID: string }): Promise<{ items: MonitorItem[] }> => ({
      items: monitors
        .list()
        .filter((monitor) => monitor.session === input.sessionID)
        .map((monitor) => ({
          id: monitor.id,
          name: monitor.name,
          state: monitor.paused ? "paused" : monitor.state === "waiting" ? "waiting" : "running",
          events: monitor.events,
          ...(monitor.maxEvents === undefined ? {} : { maxEvents: monitor.maxEvents }),
          expiresAt: Date.parse(monitor.expiresAt),
          ...(monitor.nextRearm === undefined ? {} : { nextRearmAt: Date.parse(monitor.nextRearm) }),
        })),
    }),
    stop: async (input: { id: string; sessionID: string }): Promise<{ stopped: boolean }> => {
      const monitor = monitors.list().find((item) => item.id === input.id)
      if (!monitor || monitor.session !== input.sessionID) return { stopped: false }
      return { stopped: (await monitors.stop(input.id)) !== undefined }
    },
  }
}
