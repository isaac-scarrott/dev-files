import { randomUUID } from "node:crypto"
import { Plugin } from "@opencode/plugin"
import { answeredText, dismissedText } from "./logic.js"
import { QuestionBackground, questionSchema, type Question } from "./rpc.js"

const TOOL = "question_background"

const toolInput = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: questionSchema,
      minItems: 1,
      description: "Questions to ask, without blocking your turn",
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const

const DESCRIPTION = [
  "Asks the user questions without blocking your turn: the call returns at once, so you keep working on other things right away.",
  "The user sees the same kind of dialog as the regular question tool. Whenever they answer, or close it without answering, that arrives later as a new message in this session — you do not wait for it here.",
  "Use the regular question tool instead when you need the answer before you can continue. Each question here offers a single choice (no multi-select) or free text; there is no `multiple` option.",
].join(" ")

type Pending = { sessionID: string; questions: Question[] }

export default Plugin.define({
  id: "question-async",
  async setup(ctx) {
    const pending = new Map<string, Pending>()

    const rpc = await ctx.rpc.register(QuestionBackground, {
      answer: async (input) => {
        const { requestID, answers } = input as { requestID: string; answers: string[][] }
        const request = pending.get(requestID)
        if (!request) return { accepted: false }
        pending.delete(requestID)
        await ctx.session.synthetic({
          sessionID: request.sessionID,
          text: answeredText(request.questions, answers),
          description: "Background question answered",
          delivery: "queue",
        })
        return { accepted: true }
      },
      dismiss: async (input) => {
        const { requestID } = input as { requestID: string }
        const request = pending.get(requestID)
        if (!request) return { accepted: false }
        pending.delete(requestID)
        await ctx.session.synthetic({
          sessionID: request.sessionID,
          text: dismissedText(request.questions),
          description: "Background question dismissed",
          delivery: "queue",
        })
        return { accepted: true }
      },
    })

    await ctx.tool.transform((editor) => {
      editor.add({
        name: TOOL,
        description: DESCRIPTION,
        input: toolInput,
        async execute(input, toolCtx) {
          const { questions } = input as { questions: Question[] }
          const requestID = randomUUID()
          pending.set(requestID, { sessionID: toolCtx.sessionID, questions })
          await rpc.events.emit("asked", { requestID, sessionID: toolCtx.sessionID, questions })
          return {
            output:
              "The question was sent to the user. Continue with other work now; their answer (or that they closed it) will arrive later as a new message.",
          }
        },
      })
    })
  },
})
