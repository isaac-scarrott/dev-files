import { Rpc } from "@opencode/plugin/rpc"

const sessionID = { type: "string", minLength: 1 } as const
const enabled = { type: "boolean" } as const

/** The GUI and the server plugin are separate processes; the server owns the state and the GUI reads and writes it here. */
export const UsageResume = Rpc.define({
  id: "usage-resume",
  methods: {
    get: {
      input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
      output: {
        type: "object",
        properties: {
          enabled,
          /** False for a subagent session: it is never resumed, so the toggle is not offered. */
          available: enabled,
        },
        required: ["enabled", "available"],
        additionalProperties: false,
      },
    },
    set: {
      input: {
        type: "object",
        properties: { sessionID, enabled },
        required: ["sessionID", "enabled"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
    },
    getDefault: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
    },
    setDefault: {
      input: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
      output: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
    },
  },
  events: {
    changed: {
      schema: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
})
