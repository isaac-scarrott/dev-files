import { Rpc } from "@opencode/plugin/rpc"

const callID = { type: "string", minLength: 1 } as const
const sessionID = { type: "string", minLength: 1 } as const

export const VisualReplies = Rpc.define({
  id: "visual-replies",
  methods: {
    get: {
      input: { type: "object", properties: { callID }, required: ["callID"], additionalProperties: false },
      output: {
        type: "object",
        properties: {
          callID,
          sessionID,
          title: { type: "string" },
          html: { type: "string" },
          created: { type: "number" },
        },
        required: ["callID", "sessionID", "title", "html", "created"],
        additionalProperties: false,
      },
      errors: {
        not_found: {
          type: "object",
          properties: { callID },
          required: ["callID"],
          additionalProperties: false,
        },
      },
    },
    list: {
      input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
      output: {
        type: "object",
        properties: {
          pages: {
            type: "array",
            items: {
              type: "object",
              properties: { callID, title: { type: "string" }, created: { type: "number" } },
              required: ["callID", "title", "created"],
              additionalProperties: false,
            },
          },
        },
        required: ["pages"],
        additionalProperties: false,
      },
    },
  },
  events: {
    published: {
      schema: {
        type: "object",
        properties: { sessionID, callID },
        required: ["sessionID", "callID"],
        additionalProperties: false,
      },
    },
  },
})
