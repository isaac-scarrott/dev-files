import type { Monitors } from "./manager.js"

/** The handlers behind the desktop row's Stop button. A monitor belongs to one session, and only that session's row may stop it. */
export function monitorControl(monitors: Pick<Monitors, "list" | "stop">) {
  return {
    running: async (input: { ids: readonly string[] }): Promise<{ ids: string[] }> => {
      const wanted = new Set(input.ids)
      return { ids: monitors.list().filter((monitor) => wanted.has(monitor.id)).map((monitor) => monitor.id) }
    },
    stop: async (input: { id: string; sessionID: string }): Promise<{ stopped: boolean }> => {
      const monitor = monitors.list().find((item) => item.id === input.id)
      if (!monitor || monitor.session !== input.sessionID) return { stopped: false }
      return { stopped: (await monitors.stop(input.id)) !== undefined }
    },
  }
}
