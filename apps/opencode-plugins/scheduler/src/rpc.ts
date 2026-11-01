import { Rpc } from "@opencode/plugin/rpc"

const id = { type: "string", minLength: 1 } as const

/** What the desktop row asks of the scheduler: which of these repeating tasks are still scheduled, and cancel one. Ids and booleans only. */
export const ScheduleControl = Rpc.define({
  id: "scheduler",
  methods: {
    active: {
      input: { type: "object", properties: { ids: { type: "array", items: id, maxItems: 200 } }, required: ["ids"], additionalProperties: false },
      output: { type: "object", properties: { ids: { type: "array", items: id } }, required: ["ids"], additionalProperties: false },
    },
    cancel: {
      input: { type: "object", properties: { id, sessionID: id }, required: ["id", "sessionID"], additionalProperties: false },
      output: { type: "object", properties: { cancelled: { type: "boolean" } }, required: ["cancelled"], additionalProperties: false },
    },
  },
  events: {},
})
