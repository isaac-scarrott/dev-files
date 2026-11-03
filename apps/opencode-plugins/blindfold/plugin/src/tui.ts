import { Plugin } from "@opencode/plugin/tui"
import { check, normalize } from "./fields.js"
import { Blindfold, type RequestedField, type SecretRequested, type SecretResolved } from "./rpc.js"

type Decision = "allow" | "always" | "deny"

export default Plugin.define({
  id: "blindfold",
  setup(ctx) {
    const blindfold = ctx.client.rpc(Blindfold)
    // Requests with an open dialog in this client.
    const open = new Set<string>()

    const labelOf = (field: RequestedField) => field.label
    const site = (origin: string | undefined) => (origin ? ` for ${origin.replace(/^https:\/\//, "")}` : "")

    /** The candidate for each provider field, asking when several can serve it. Undefined when the user backs out or one is locked (the terminal cannot unlock). */
    async function pick(request: SecretRequested) {
      const picks: Record<string, string> = {}
      for (const field of request.fields.filter((item) => item.source?.state === "choose")) {
        const candidates = field.source!.candidates
        let key = field.source!.selected
        if (!key) {
          key = await ctx.ui.dialog.select({
            title: `Where does ${labelOf(field)} come from${site(request.origin)}?`,
            options: candidates.map((item) => ({ title: item.label, value: item.key, description: item.item?.title, disabled: item.state === "locked", footer: item.state === "locked" ? "locked: unlock it in the desktop app" : undefined })),
          })
          if (key === undefined) return undefined
        }
        if (candidates.find((item) => item.key === key)?.state === "locked") {
          ctx.ui.toast.show({ variant: "error", message: `${candidates.find((item) => item.key === key)!.label} is locked. Unlock it in the OpenCode desktop app.` })
          return undefined
        }
        picks[field.name] = key
      }
      return picks
    }

    // The terminal prompt has no masked mode, so a secret is shown as typed: one prompt per field, in order.
    async function answer(request: SecretRequested, options: Parameters<typeof blindfold.submit>[1]) {
      const ack = (await blindfold.ack({ requestID: request.requestID }, options)) as { accepted: boolean }
      if (!ack.accepted) return
      open.add(request.requestID)
      const providers = request.fields.filter((field) => field.source?.state === "choose")
      let remember = false
      if (providers.length > 0) {
        const picks = await pick(request)
        if (!open.has(request.requestID)) return
        const named = providers.map((field) => `${field.name} from ${field.source!.candidates.find((item) => item.key === picks?.[field.name])?.label ?? "your password manager"}`).join(", ")
        const decision = picks && (await ctx.ui.dialog.select<Decision>({
          title: `${request.via === "fill" ? "Fill" : "Use"} ${named}${site(request.origin)}?`,
          options: [
            { title: "Allow", value: "allow", description: "This once" },
            { title: "Always allow", value: "always", description: "Save a rule for this site and account" },
            { title: "Deny", value: "deny" },
          ],
        }))
        if (!open.delete(request.requestID)) return
        if (!picks || !decision || decision === "deny") {
          await blindfold.cancel({ requestID: request.requestID }, options)
          return
        }
        remember = decision === "always"
        open.add(request.requestID)
        const values = await typed(request, options)
        if (!values) return
        await blindfold.submit({ requestID: request.requestID, values, picks, remember }, options)
        return
      }
      const values = await typed(request, options)
      if (values) await blindfold.submit({ requestID: request.requestID, values }, options)
    }

    /** The fields no provider serves, asked one at a time. Undefined when the user cancels or another client answered. */
    async function typed(request: SecretRequested, options: Parameters<typeof blindfold.submit>[1]) {
      const fields = request.fields.filter((field) => field.source?.state !== "choose")
      const values: Record<string, string> = {}
      for (const field of fields) {
        while (true) {
          open.add(request.requestID)
          const value = await ctx.ui.dialog.prompt({
            title: `Enter ${field.label}`,
            description: fields.length > 1 ? `${request.reason} (${Object.keys(values).length + 1} of ${fields.length})` : request.reason,
            placeholder: field.masked ? "Secret value" : field.label,
          })
          // Another client answered, or the request expired, while the dialog was open.
          if (!open.delete(request.requestID)) return undefined
          if (value === undefined) {
            await blindfold.cancel({ requestID: request.requestID }, options)
            return undefined
          }
          const text = normalize(field.kind, value)
          // Empty and clearly invalid submissions reopen the dialog because a value is required.
          if (text === "" || check(field.kind, text).level === "invalid") continue
          values[field.name] = text
          break
        }
      }
      return values
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
