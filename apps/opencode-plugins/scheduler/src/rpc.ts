import { Rpc } from "@opencode/plugin/rpc"

const id = { type: "string", minLength: 1 } as const

const num = { type: "number" } as const

/** What the desktop asks of the scheduler: which of these repeating tasks are still scheduled, what is scheduled for a session, and cancel one. Ids, names, numbers and booleans only. */
export const ScheduleControl = Rpc.define({
  id: "scheduler",
  methods: {
    active: {
      input: { type: "object", properties: { ids: { type: "array", items: id, maxItems: 200 } }, required: ["ids"], additionalProperties: false },
      output: { type: "object", properties: { ids: { type: "array", items: id } }, required: ["ids"], additionalProperties: false },
    },
    /** The tasks that wake one session, for the composer chip. */
    pending: {
      input: { type: "object", properties: { sessionID: id }, required: ["sessionID"], additionalProperties: false },
      output: {
        type: "object",
        properties: {
          items: {
            type: "array",
            maxItems: 200,
            items: {
              type: "object",
              properties: {
                id,
                name: { type: "string" },
                kind: { type: "string", enum: ["once", "every", "cron"] },
                spec: { type: "string" },
                paused: { type: "boolean" },
                nextRun: num,
                runs: num,
                maxRuns: num,
              },
              required: ["id", "name", "kind", "spec", "paused", "nextRun", "runs"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
    cancel: {
      input: { type: "object", properties: { id, sessionID: id }, required: ["id", "sessionID"], additionalProperties: false },
      output: { type: "object", properties: { cancelled: { type: "boolean" } }, required: ["cancelled"], additionalProperties: false },
    },
  },
  events: {},
})
