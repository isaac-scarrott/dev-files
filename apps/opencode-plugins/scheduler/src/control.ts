import type { Hub } from "./hub.js"

/** The handlers behind the desktop row's Cancel button. A task belongs to the session it wakes, and only that session's row may cancel it. */
export function scheduleControl(hub: Pick<Hub, "list" | "cancel">) {
  return {
    active: async (input: { ids: readonly string[] }): Promise<{ ids: string[] }> => {
      const wanted = new Set(input.ids)
      return { ids: hub.list().jobs.filter((job) => wanted.has(job.id) && job.status === "active").map((job) => job.id) }
    },
    cancel: async (input: { id: string; sessionID: string }): Promise<{ cancelled: boolean }> => {
      const job = hub.list().jobs.find((item) => item.id === input.id)
      if (!job || job.sessionID !== input.sessionID) return { cancelled: false }
      return { cancelled: (await hub.cancel(input.id)).cancelled !== undefined }
    },
  }
}
