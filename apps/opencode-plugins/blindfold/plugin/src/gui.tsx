import { Command, Plugin, SettingsPage, Style, createKeyed } from "@opencode/plugin/gui"
import { createRoot, getOwner, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { findAnchor, place } from "./anchor.js"
import { RequestCard, list, mayTakeFocus } from "./card.js"
import { createModel, type Model } from "./model.js"
import { BlindfoldPage } from "./page.js"
import { Blindfold, type Overview, type RequestedField, type SecretRequested, type SecretResolved } from "./rpc.js"
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
      fill: "Fill {{names}} for {{site}}",
      use: "Use {{names}} for {{site}}",
      useNamed: "Use {{names}}",
      from: "{{title}} from {{account}}?",
      ask: "{{title}}?",
      and: "and",
      note: "The agent can't see what you enter.",
      noteProvider: "The agent can't see the values.",
      unlockFirst: "Unlock {{account}} first.",
      isLocked: "{{account}} is locked",
      fromAccount: "from {{detail}}",
      locked: "locked",
      choose: "Choose where {{label}} come from",
      chooseBelow: "from the account chosen above",
      unlock: "Unlock",
      "unlock.password": "Master password",
      "unlock.token": "Service account token",
      "unlock.clientId": "Client ID",
      "unlock.clientSecret": "Client secret",
      cancel: "Cancel",
      submit: "Submit",
      deny: "Deny",
      allow: "Allow",
      always: "Always allow",
      "page.title": "Blindfold",
      "page.description": "Logins your password managers may hand to agents, and the rules you saved with Always allow. Values are never stored here.",
      "page.accounts": "Accounts",
      "page.noAccounts": "No password manager is set up. Add blindfold-providers to your plugins.",
      "page.unlocked": "Unlocked. Locks itself when idle.",
      "page.locked": "Locked. You unlock it when an agent needs it.",
      "page.unavailable": "Unavailable: {{reason}}",
      "page.lock": "Lock",
      "page.rules": "Always allowed",
      "page.noRules": "Nothing is always allowed. Each use asks you first.",
      "page.ruleOrigin": "{{field}} on {{site}}",
      "page.ruleName": "{{name}}",
      "page.ruleFrom": "From {{account}}",
      "page.ruleFromItem": "From {{account}} · {{item}}",
      "page.revoke": "Revoke",
      "page.recent": "Recent use",
      "page.noRecent": "Nothing used yet in this session.",
      "page.outcome.allowed": "Allowed {{name}}",
      "page.outcome.always": "Always allowed {{name}}",
      "page.outcome.rule": "Used {{name}} under a saved rule",
      "page.outcome.denied": "Denied {{name}}",
      "page.outcome.error": "Could not read {{name}}",
      manage: "Blindfold: manage rules",
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
    // What the settings page calls; set while a client is connected.
    let manage: Pick<Parameters<typeof BlindfoldPage>[0], "load" | "revoke" | "lock" | "changes"> | undefined
    ctx.add(SettingsPage, {
      id: "blindfold",
      title: ctx.t("page.title"),
      icon: "lock",
      entries: [{ id: "blindfold-rules", title: ctx.t("page.rules"), description: ctx.t("page.description"), keywords: "blindfold always allow rules password secrets accounts 1password bitwarden" }],
      render: () => (
        <BlindfoldPage
          ctx={ctx}
          load={() => manage?.load() ?? Promise.resolve(undefined)}
          revoke={(id) => manage?.revoke(id) ?? Promise.resolve()}
          lock={(account) => manage?.lock(account) ?? Promise.resolve()}
          changes={(listener) => manage?.changes(listener) ?? (() => undefined)}
        />
      ),
    })
    ctx.add(Command, (): Command => ({ id: "manage", title: ctx.t("manage"), section: "general", run: () => ctx.layout.settings("blindfold") }))

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
                if (mayTakeFocus(doc)) (first ? entry.host.querySelector<HTMLInputElement>(`[data-field="${first}"] input`) : entry.host.querySelector<HTMLInputElement>("[data-slot=unlock] input"))?.focus()
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
              submit: async (values, extra) => ((await blindfold.submit({ requestID: request.requestID, values, ...(extra ? { picks: extra.picks, remember: extra.remember } : {}) }, options)) as { accepted: boolean }).accepted,
              unlock: async (account, method, input) => (await blindfold.unlock({ requestID: request.requestID, account, input: { method, ...input } }, options)) as { accepted: boolean; error?: string },
              cancel: async () => ((await blindfold.cancel({ requestID: request.requestID }, options)) as { accepted: boolean }).accepted,
              failed: () => ctx.toast.show({ variant: "error", title: ctx.t("failed", { names: list(names, ctx.t("and")) }) }),
            })
            const host = doc.createElement("div")
            host.setAttribute(HOST, request.requestID)
            const stop = render(() => <RequestCard ui={ctx.ui} t={ctx.t} model={model} reason={request.reason} origin={request.origin} via={request.via} />, host)
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
        // The server answered or changed a request: another window, an unlock that completed it, or a timeout.
        onCleanup(
          blindfold.events.on("resolved", (event) => {
            const resolved = event.data as SecretResolved
            entries.get(resolved.requestID)?.model.settle(resolved.status)
          }),
        )
        onCleanup(
          blindfold.events.on("updated", (event) => {
            const update = event.data as { requestID: string; fields: RequestedField[] }
            entries.get(update.requestID)?.model.update(update.fields)
          }),
        )
        const changes = new Set<() => void>()
        onCleanup(blindfold.events.on("changed", () => changes.forEach((listener) => listener())))
        const locations = () => [...new Set(ctx.tabs.list().flatMap((tab) => (tab.session?.location ? [JSON.stringify(tab.session.location)] : [])))].map((place) => JSON.parse(place) as never)
        // The settings page asks the server part of the first location it can find; rules and accounts are shared by them all.
        manage = {
          load: async () => {
            const [place] = locations()
            return place === undefined ? undefined : ((await blindfold.overview({}, { location: place })) as Overview)
          },
          revoke: async (id) => void (await blindfold.revoke({ id }, { location: locations()[0] })),
          lock: async (account) => void (await blindfold.lock({ account }, { location: locations()[0] })),
          changes: (listener) => {
            changes.add(listener)
            return () => changes.delete(listener)
          },
        }
        onCleanup(() => (manage = undefined))
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
