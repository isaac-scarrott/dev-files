import type { Hub } from "./hub.js"

/** One scheduled task as the composer chip lists it: a name, the schedule as written, and numbers; never the prompt. */
export interface ScheduleItem {
  readonly id: string
  readonly name: string
  readonly kind: "once" | "every" | "cron"
  readonly spec: string
  readonly paused: boolean
  readonly nextRun: number
  readonly runs: number
  readonly maxRuns?: number
}

/** The handlers behind the desktop row's Cancel button and the composer chip. A task belongs to the session it wakes, and only that session's row may cancel it. */
export function scheduleControl(hub: Pick<Hub, "list" | "cancel">) {
  return {
    active: async (input: { ids: readonly string[] }): Promise<{ ids: string[] }> => {
      const wanted = new Set(input.ids)
      return { ids: hub.list().jobs.filter((job) => wanted.has(job.id) && job.status === "active").map((job) => job.id) }
    },
    pending: async (input: { sessionID: string }): Promise<{ items: ScheduleItem[] }> => ({
      items: hub
        .list()
        .jobs.filter((job) => job.sessionID === input.sessionID)
        .map((job) => ({
          id: job.id,
          name: job.name,
          kind: job.kind,
          spec: job.spec,
          paused: job.status === "paused",
          nextRun: job.nextRun,
          runs: job.runs,
          ...(job.maxRuns === undefined ? {} : { maxRuns: job.maxRuns }),
        })),
    }),
    cancel: async (input: { id: string; sessionID: string }): Promise<{ cancelled: boolean }> => {
      const job = hub.list().jobs.find((item) => item.id === input.id)
      if (!job || job.sessionID !== input.sessionID) return { cancelled: false }
      return { cancelled: (await hub.cancel(input.id)).cancelled !== undefined }
    },
  }
}
