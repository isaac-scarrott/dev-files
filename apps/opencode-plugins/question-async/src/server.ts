import { randomUUID } from "node:crypto"
import { Plugin } from "@opencode/plugin"
import { answersFromForm, answeredText, dismissedText, failedText } from "./logic.js"
import { QuestionBackground, questionSchema, type Asked, type Question } from "./rpc.js"

const TOOL = "question_background"
const STORE_KEY = "pending"

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
  "The user sees the same question card as the regular question tool. Whenever they answer, or dismiss it, that arrives later as a new message in this session — you do not wait for it here.",
  "Use the regular question tool instead when you need the answer before you can continue. Set `multiple` on a question to let the user pick several options.",
].join(" ")

type Pending = Asked & { claimed: boolean; formID?: string }

type FormEvent = { type: string; data: { id?: string; sessionID?: string; answer?: Record<string, unknown>; form?: { id: string; metadata?: { requestID?: unknown } } } }

export default Plugin.define({
  id: "question-async",
  async setup(ctx) {
    const pending = new Map<string, Pending>()
    const save = () => ctx.storage.set(STORE_KEY, JSON.parse(JSON.stringify([...pending.values()])))

    // A restart keeps the host's forms; keeping the requests lets their replies still reach the session. A request
    // that was claimed but never got its form goes back to waiting for a window.
    const stored = (await ctx.storage.get(STORE_KEY)) as Pending[] | undefined
    for (const request of stored ?? []) pending.set(request.requestID, { ...request, claimed: !!request.formID })

    const byForm = (formID: string) => [...pending.values()].find((request) => request.formID === formID)

    async function deliver(request: Pending, text: string, description: string) {
      if (!pending.delete(request.requestID)) return
      await save()
      await ctx.session.synthetic({ sessionID: request.sessionID, text, description, delivery: "queue" })
    }

    const rpc = await ctx.rpc.register(QuestionBackground, {
      claim: async (input) => {
        const request = pending.get((input as { requestID: string }).requestID)
        if (!request || request.claimed) return { accepted: false }
        request.claimed = true
        return { accepted: true }
      },
      pending: async () => ({
        requests: [...pending.values()].filter((r) => !r.claimed).map(({ claimed: _c, formID: _f, ...asked }) => asked),
      }),
      failed: async (input) => {
        const { requestID, reason } = input as { requestID: string; reason: string }
        const request = pending.get(requestID)
        if (!request) return { accepted: false }
        await deliver(request, failedText(request.questions, reason), "Background question failed")
        return { accepted: true }
      },
    })

    const abort = new AbortController()
    void (async () => {
      for await (const raw of ctx.event.subscribe({ types: ["form.created", "form.replied", "form.cancelled"], signal: abort.signal })) {
        const event = raw as unknown as FormEvent
        if (event.type === "form.created") {
          const form = event.data.form
          const request = typeof form?.metadata?.requestID === "string" ? pending.get(form.metadata.requestID) : undefined
          if (form && request && !request.formID) {
            request.formID = form.id
            await save()
          }
        } else {
          const request = event.data.id ? byForm(event.data.id) : undefined
          if (!request) continue
          if (event.type === "form.replied") {
            await deliver(request, answeredText(request.questions, answersFromForm(request.questions, event.data.answer ?? {})), "Background question answered")
          } else {
            await deliver(request, dismissedText(request.questions), "Background question dismissed")
          }
        }
      }
    })().catch(() => undefined)

    await ctx.tool.transform((editor) => {
      editor.add({
        name: TOOL,
        description: DESCRIPTION,
        input: toolInput,
        async execute(input, toolCtx) {
          const { questions } = input as { questions: Question[] }
          const asked: Asked = { requestID: randomUUID(), sessionID: toolCtx.sessionID, messageID: toolCtx.messageID, callID: toolCtx.id, questions }
          pending.set(asked.requestID, { ...asked, claimed: false })
          await save()
          await rpc.events.emit("asked", asked)
          return {
            content:
              "The question was sent to the user. Continue with other work now; their answer (or that they dismissed it) will arrive later as a new message.",
          }
        },
      })
    })

    return () => abort.abort()
  },
})
