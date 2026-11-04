import { Command, Plugin, SettingsPage, Style, createKeyed } from "@opencode/plugin/gui"
import { onCleanup } from "solid-js"
import { en } from "./messages.js"
import { PasswordManagersPage, type Api } from "./page.js"
import { Providers, type Overview, type Reply } from "./rpc.js"
import css from "./style.css?inline"

const PAGE = "blindfold-providers"

export default Plugin.define({
  i18n: { en },
  setup(ctx) {
    ctx.add(Style, css)
    // What the page calls; set while a client is connected.
    let api: Omit<Api, "changes"> | undefined
    const listeners = new Set<() => void>()
    const none: Reply = { ok: false, error: ctx.t("error.unreachable") }
    const open = () => ctx.layout.settings(PAGE)

    ctx.add(SettingsPage, {
      id: PAGE,
      title: ctx.t("page.title"),
      icon: "shield",
      entries: [
        { id: "passwords-accounts", title: ctx.t("page.accounts"), description: ctx.t("page.description"), keywords: "password manager 1password bitwarden accounts set up service account token vault op bw connect" },
        { id: "passwords-help", title: ctx.t("help.heading"), keywords: "1password agent vault service account create steps" },
      ],
      render: () => (
        <PasswordManagersPage
          ctx={ctx}
          api={{
            load: (fresh) => api?.load(fresh) ?? Promise.resolve(undefined),
            add: (provider, settings, secrets) => api?.add(provider, settings, secrets) ?? Promise.resolve(none),
            update: (id, settings, secrets) => api?.update(id, settings, secrets) ?? Promise.resolve(none),
            remove: (id) => api?.remove(id) ?? Promise.resolve(none),
            confirm: (value) => api?.confirm(value) ?? Promise.resolve(none),
            lock: (id) => api?.lock(id) ?? Promise.resolve(none),
            unlock: (id, password) => api?.unlock(id, password) ?? Promise.resolve(none),
            test: (id) => api?.test(id) ?? Promise.resolve(none),
            verify: (id, itemId) => api?.verify(id, itemId) ?? Promise.resolve(none),
            changes: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
            reachable: () => api?.reachable() ?? false,
          }}
        />
      ),
    })
    ctx.add(Command, (): Command => ({ id: "setup", title: ctx.t("command.setup"), section: "general", run: open }))

    // A restarted server comes back with a new client, so listen again on each.
    createKeyed(
      () => ctx.client,
      (client) => {
        const rpc = client.rpc(Providers)
        const locations = () => [...new Set(ctx.tabs.list().flatMap((tab) => (tab.session?.location ? [JSON.stringify(tab.session.location)] : [])))].map((place) => JSON.parse(place) as never)
        // The accounts are shared by every location: ask the server part of the first one that can be found.
        const options = () => ({ location: locations()[0] })
        const call = async <T,>(work: () => Promise<unknown>): Promise<T> => (locations().length === 0 ? (none as T) : ((await work()) as T))
        api = {
          load: async (fresh) => (locations().length === 0 ? undefined : ((await rpc.overview({ fresh: fresh === true }, options())) as Overview)),
          add: (provider, settings, secrets) => call<Reply>(() => rpc.add({ provider, settings, secrets }, options())),
          update: (id, settings, secrets) => call<Reply>(() => rpc.update({ id, ...(settings ? { settings } : {}), ...(secrets ? { secrets } : {}) }, options())),
          remove: (id) => call<Reply>(() => rpc.remove({ id }, options())),
          confirm: (value) => call<Reply>(() => rpc.confirm({ key: "opAppIntegrationOff", value }, options())),
          lock: (id) => call<Reply>(() => rpc.lock({ id }, options())),
          unlock: (id, password) => call<Reply>(() => rpc.unlock({ id, password }, options())),
          test: (id) => call<Reply>(() => rpc.test({ id }, options())),
          verify: (id, itemId) => call<Reply>(() => rpc.verify({ id, itemId }, options())),
          reachable: () => locations().length > 0,
        }
        onCleanup(rpc.events.on("changed", () => listeners.forEach((listener) => listener())))
        onCleanup(() => (api = undefined))
      },
    )
  },
})
