import { Plugin, Style, createKeyed } from "@opencode/plugin/gui"
import { createRoot, getOwner, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { findAnchor, place } from "./anchor.js"
import { RequestCard, list, mayTakeFocus } from "./card.js"
import { createModel, type Model } from "./model.js"
import { Blindfold, type SecretRequested, type SecretResolved } from "./rpc.js"
import css from "./style.css?inline"

const HOST = "data-blindfold-request"
/** A card nobody can see within this long (its session is not on screen) is announced with a toast. */
const UNSEEN_MS = 800
/** Answered cards are kept as one-line rows; the oldest go first. */
const KEEP = 20

type Entry = {
  request: SecretRequested
  host: HTMLElement
  model: Model
  partIDs: string[]
  placed: boolean
  dispose: () => void
  dismiss?: () => void
  timer?: ReturnType<typeof setTimeout>
}

type Part = { id?: string; type?: string; state?: { status?: string } }

export default Plugin.define({
  i18n: {
    en: {
      title: "Enter {{names}}",
      and: "and",
      note: "The agent can't see what you enter.",
      cancel: "Cancel",
      submit: "Submit",
      show: "Show {{label}}",
      hide: "Hide {{label}}",
      "hint.email": "That doesn't look like an email address.",
      "hint.email-domain": "The address has no domain ending. Check it.",
      "hint.space": "Starts or ends with a space.",
      "row.provided": "Secrets provided",
      "row.declined": "Secrets declined",
      "row.expired": "Secret request expired",
      failed: "Could not send {{names}}.",
      waiting: "Needs {{names}}",
      waitingBody: "The agent is waiting for you in another session.",
      go: "Show",
    },
  },
  setup(ctx) {
    ctx.add(Style, css)
    const doc = document

    // A restarted server comes back with a new client, so listen again on each.
    createKeyed(
      () => ctx.client,
      (client) => {
        const blindfold = client.rpc(Blindfold)
        const owner = getOwner()
        const entries = new Map<string, Entry>()
        let pending = false

        const hosts = () => doc.querySelectorAll(`[${HOST}]`)

        function retire(id: string) {
          const entry = entries.get(id)
          if (!entry) return
          clearTimeout(entry.timer)
          entry.dismiss?.()
          entry.dispose()
          entry.host.remove()
          entries.delete(id)
          if (entries.size === 0) observer.disconnect()
        }

        const open = (entry: Entry) => entry.model.phase() === "open" || entry.model.phase() === "sending"

        /** Its session is not on screen: say so, and offer to go there. Not repeated while the toast shows. */
        function announce(entry: Entry) {
          entry.timer = undefined
          if (entry.placed || !open(entry) || entry.dismiss) return
          const names = list(entry.request.fields.map((field) => field.label), ctx.t("and"))
          const tab = ctx.tabs.list().find((item) => item.session?.id === entry.request.sessionID)
          entry.dismiss = ctx.toast.show({
            title: ctx.t("waiting", { names }),
            description: ctx.t("waitingBody"),
            persistent: true,
            actions: tab ? [{ label: ctx.t("go"), run: () => ctx.tabs.focus(tab.key) }] : undefined,
          }).dismiss
        }

        function arrange() {
          pending = false
          // The timeline on screen belongs to the routed session; a card of another session waits, out of the page.
          const current = ctx.sessions.current()?.id
          for (const entry of entries.values()) {
            const mine = entry.request.sessionID === current
            const ok = mine && place(entry.host, findAnchor(doc, entry.partIDs, open(entry)))
            if (!mine) entry.host.remove()
            if (ok) {
              if (!entry.placed) {
                entry.placed = true
                // Focus goes to the first empty field once the card is in the page, unless that would take text being typed.
                const first = entry.model.next()
                if (first && mayTakeFocus(doc)) entry.host.querySelector<HTMLInputElement>(`[data-field="${first}"] input`)?.focus()
              }
              clearTimeout(entry.timer)
              entry.timer = undefined
              entry.dismiss?.()
              entry.dismiss = undefined
            } else {
              entry.placed = false
              if (!entry.timer && !entry.dismiss && open(entry)) entry.timer = setTimeout(() => announce(entry), UNSEEN_MS)
            }
          }
        }

        function schedule() {
          if (pending) return
          pending = true
          requestAnimationFrame(arrange)
        }

        // Rows mount and unmount as the timeline scrolls, taking a card with them; put it back where its row is.
        const observer = new MutationObserver((mutations) => {
          const ours = (node: Node) => node instanceof Element && node.hasAttribute(HOST)
          if (mutations.every((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].every(ours))) return
          schedule()
        })
        // Watching the page costs on every change, so it runs only while there is a card or row to keep in place.
        onCleanup(() => {
          observer.disconnect()
          for (const id of [...entries.keys()]) retire(id)
          for (const stale of hosts()) stale.remove()
        })

        /** Tool part ids that can be the call that asked: the call itself, then the running parts of its message. */
        async function runningParts(request: SecretRequested) {
          const result = await client.message.list({ sessionID: request.sessionID, limit: 10 }, { signal: ctx.signal })
          const ids: string[] = []
          for (const message of result.data as { id?: string; content?: unknown }[]) {
            if (message.id !== request.messageID || !Array.isArray(message.content)) continue
            for (const part of message.content as Part[]) if (part?.type === "tool" && part.id && part.state?.status === "running") ids.push(part.id)
          }
          return ids.reverse()
        }

        function mount(request: SecretRequested, options: Options) {
          const names = request.fields.map((field) => field.name)
          const entry = createRoot((dispose) => {
            const model = createModel(request.fields, {
              submit: async (values) => ((await blindfold.submit({ requestID: request.requestID, values }, options)) as { accepted: boolean }).accepted,
              cancel: async () => ((await blindfold.cancel({ requestID: request.requestID }, options)) as { accepted: boolean }).accepted,
              failed: () => ctx.toast.show({ variant: "error", title: ctx.t("failed", { names: list(names, ctx.t("and")) }) }),
            })
            const host = doc.createElement("div")
            host.setAttribute(HOST, request.requestID)
            const stop = render(() => <RequestCard ui={ctx.ui} t={ctx.t} model={model} reason={request.reason} />, host)
            const made: Entry = { request, host, model, partIDs: [request.callID], placed: false, dispose: () => (stop(), dispose()) }
            return made
          }, owner)
          entries.set(request.requestID, entry)
          observer.observe(doc.body, { childList: true, subtree: true })
          schedule()
          void runningParts(request)
            .then((ids) => {
              entry.partIDs = [request.callID, ...ids]
              schedule()
            })
            .catch(() => undefined)
          const answered = [...entries.values()].filter((item) => !open(item))
          for (const old of answered.slice(0, Math.max(0, answered.length - KEEP))) retire(old.request.requestID)
        }

        type Options = Parameters<typeof blindfold.submit>[1]
        async function adopt(request: SecretRequested, options: Options) {
          try {
            const ack = (await blindfold.ack({ requestID: request.requestID }, options)) as { accepted: boolean }
            if (ack.accepted && !entries.has(request.requestID)) mount(request, options)
          } catch {
            ctx.toast.show({ variant: "error", title: ctx.t("failed", { names: list(request.fields.map((field) => field.name), ctx.t("and")) }) })
          }
        }

        createKeyed(() => ctx.sessions.current()?.id, schedule)

        onCleanup(blindfold.events.on("requested", (event) => adopt(event.data as SecretRequested, { location: event.location })))
        // A window that reloaded while a request was open shows it again.
        // Where sessions are open can be unknown at setup and arrives later, so ask again whenever that set changes.
        createKeyed(
          () => JSON.stringify([...new Set(ctx.tabs.list().flatMap((tab) => (tab.session?.location ? [JSON.stringify(tab.session.location)] : [])))]),
          (places) => {
            for (const place of JSON.parse(places) as string[]) {
              const options: Options = { location: JSON.parse(place) }
              void blindfold
                .list({}, options)
                .then((reply) => (reply as { requests: SecretRequested[] }).requests.forEach((request) => void adopt(request, options)))
                .catch(() => undefined)
            }
          },
        )
      },
    )
  },
})
