import { Rpc } from "@opencode/plugin/rpc"
import type { Field } from "./fields.js"

const request = {
  type: "object",
  properties: { requestID: { type: "string" } },
  required: ["requestID"],
  additionalProperties: false,
} as const

const reply = {
  type: "object",
  properties: { accepted: { type: "boolean" } },
  required: ["accepted"],
  additionalProperties: false,
} as const

const requestedSchema = {
  type: "object",
  properties: {
    requestID: { type: "string" },
    sessionID: { type: "string" },
    callID: { type: "string" },
    messageID: { type: "string" },
    reason: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          label: { type: "string" },
          kind: { enum: ["text", "email", "secret"] },
          masked: { type: "boolean" },
        },
        required: ["name", "label", "kind", "masked"],
        additionalProperties: false,
      },
    },
  },
  required: ["requestID", "sessionID", "callID", "messageID", "reason", "fields"],
  additionalProperties: false,
} as const

export const Blindfold = Rpc.define({
  id: "blindfold",
  methods: {
    submit: {
      input: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          values: { type: "object", additionalProperties: { type: "string", minLength: 1 } },
        },
        required: ["requestID", "values"],
        additionalProperties: false,
      },
      output: reply,
    },
    ack: { input: request, output: reply },
    // What is still waiting, so a window that reloaded while a card was open shows it again.
    list: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { requests: { type: "array", items: requestedSchema } }, required: ["requests"], additionalProperties: false },
    },
    cancel: { input: request, output: reply },
  },
  events: {
    requested: {
      schema: requestedSchema,
    },
    resolved: {
      schema: {
        type: "object",
        properties: { requestID: { type: "string" }, status: { enum: ["submitted", "cancelled", "timeout", "unavailable"] } },
        required: ["requestID", "status"],
        additionalProperties: false,
      },
    },
  },
})

export type SecretResolved = { requestID: string; status: "submitted" | "cancelled" | "timeout" | "unavailable" }

export type SecretRequested = {
  requestID: string
  sessionID: string
  callID: string
  messageID: string
  reason: string
  fields: Field[]
}
