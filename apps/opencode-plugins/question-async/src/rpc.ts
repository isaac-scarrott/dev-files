import { Rpc } from "@opencode/plugin/rpc"

export const optionSchema = {
  type: "object",
  properties: {
    label: { type: "string", description: "Display text (1-5 words, concise)" },
    description: { type: "string", description: "Explanation of choice" },
  },
  required: ["label", "description"],
  additionalProperties: false,
} as const

export const questionSchema = {
  type: "object",
  properties: {
    question: { type: "string", description: "Complete question" },
    header: { type: "string", description: "Very short label (max 30 chars)" },
    options: { type: "array", items: optionSchema, description: "Available choices" },
  },
  required: ["question", "header", "options"],
  additionalProperties: false,
} as const

const reply = {
  type: "object",
  properties: { accepted: { type: "boolean" } },
  required: ["accepted"],
  additionalProperties: false,
} as const

const requestID = {
  type: "object",
  properties: { requestID: { type: "string" } },
  required: ["requestID"],
  additionalProperties: false,
} as const

export const QuestionBackground = Rpc.define({
  id: "question-async",
  methods: {
    // The GUI's answers, one array of chosen labels (or typed text) per question, in order.
    answer: {
      input: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          answers: { type: "array", items: { type: "array", items: { type: "string" } } },
        },
        required: ["requestID", "answers"],
        additionalProperties: false,
      },
      output: reply,
    },
    dismiss: { input: requestID, output: reply },
    // Diagnostic only: the GUI calls this the instant it receives "asked", before it tries to show anything, so the
    // server can tell "no GUI ever heard the event" apart from "it heard it, but showing a dialog failed".
    ack: { input: requestID, output: reply },
  },
  events: {
    // A question_background tool call, for the GUI to show as the app's own dialogs.
    asked: {
      schema: {
        type: "object",
        properties: {
          requestID: { type: "string" },
          sessionID: { type: "string" },
          questions: { type: "array", items: questionSchema },
        },
        required: ["requestID", "sessionID", "questions"],
        additionalProperties: false,
      },
    },
  },
})

export type Option = { label: string; description: string }
export type Question = { question: string; header: string; options: Option[] }
export type Asked = { requestID: string; sessionID: string; questions: Question[] }
