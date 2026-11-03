import { Plugin } from "@opencode/plugin/tui"
import { check, normalize } from "./fields.js"
import { Blindfold, type SecretRequested, type SecretResolved } from "./rpc.js"

export default Plugin.define({
  id: "blindfold",
  setup(ctx) {
    const blindfold = ctx.client.rpc(Blindfold)
    // Requests with an open dialog in this client.
    const open = new Set<string>()

    // The terminal prompt has no masked mode, so a secret is shown as typed: one prompt per field, in order.
    async function answer(request: SecretRequested, options: Parameters<typeof blindfold.submit>[1]) {
      const ack = (await blindfold.ack({ requestID: request.requestID }, options)) as { accepted: boolean }
      if (!ack.accepted) return
      const values: Record<string, string> = {}
      for (const field of request.fields) {
        while (true) {
          open.add(request.requestID)
          const value = await ctx.ui.dialog.prompt({
            title: `Enter ${field.label}`,
            description: request.fields.length > 1 ? `${request.reason} (${Object.keys(values).length + 1} of ${request.fields.length})` : request.reason,
            placeholder: field.masked ? "Secret value" : field.label,
          })
          // Another client answered, or the request expired, while the dialog was open.
          if (!open.delete(request.requestID)) return
          if (value === undefined) {
            await blindfold.cancel({ requestID: request.requestID }, options)
            return
          }
          const text = normalize(field.kind, value)
          // Empty and clearly invalid submissions reopen the dialog because a value is required.
          if (text === "" || check(field.kind, text).level === "invalid") continue
          values[field.name] = text
          break
        }
      }
      await blindfold.submit({ requestID: request.requestID, values }, options)
    }

    const stopRequested = blindfold.events.on("requested", async (event) => {
      const request = event.data as SecretRequested
      try {
        await answer(request, { location: event.location })
      } catch {
        open.delete(request.requestID)
        ctx.ui.toast.show({ variant: "error", message: `Could not send ${request.fields.map((field) => field.name).join(", ")}.` })
      }
    })

    const stopResolved = blindfold.events.on("resolved", (event) => {
      if (open.delete((event.data as SecretResolved).requestID)) ctx.ui.dialog.clear()
    })

    return () => {
      stopRequested()
      stopResolved()
    }
  },
})
