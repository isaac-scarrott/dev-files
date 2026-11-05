import { createKeyed, Plugin } from "@opencode/plugin/gui"
import { onCleanup } from "solid-js"
import { FORM_TITLE, formMetadata, toFields } from "./logic.js"
import { QuestionBackground, type Asked } from "./rpc.js"

// The host draws its own question card, attention mark and answered summary for any form like the built-in `question`
// tool's. This half only creates that form; the server half hears the reply from the host and delivers it.
export default Plugin.define({
  setup(ctx) {
    createKeyed(
      () => ctx.client,
      (client) => {
        const rpc = client.rpc(QuestionBackground)

        async function show(asked: Asked, location?: unknown) {
          const options = location ? { location: location as never } : undefined
          const claim = (await rpc.claim({ requestID: asked.requestID }, options)) as { accepted: boolean }
          if (!claim.accepted) return
          try {
            await client.session.form.create({
              sessionID: asked.sessionID,
              title: FORM_TITLE,
              metadata: formMetadata(asked.requestID, asked.messageID, asked.callID),
              fields: toFields(asked.questions),
            })
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            ctx.toast.show({ title: "Could not show the question", description: reason, variant: "error" })
            await rpc.failed({ requestID: asked.requestID, reason }, options)
          }
        }

        onCleanup(rpc.events.on("asked", (event) => void show(event.data as Asked, event.location)))

        void rpc.pending({}).then((reply) => (reply as { requests: Asked[] }).requests.forEach((asked) => void show(asked)))
      },
    )
  },
})
