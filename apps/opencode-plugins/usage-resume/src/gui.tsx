import { ComposerPill, createKeyed, createLatest, Plugin, SettingsPage } from "@opencode/plugin/gui"
import { createSignal, onCleanup } from "solid-js"
import { UsageResume } from "./rpc.js"
import { type Loaded, pillFor, type SessionState } from "./view.js"

const TITLE = "Auto-resume after usage limit"
const SETTING_ID = "usage-resume-default"

export default Plugin.define({
  i18n: {
    en: {
      title: TITLE,
      pillWaiting: "Resuming {{time}}",
      pillOff: "Resume after limit",
      pillFailed: "Auto-resume unavailable",
      saveFailed: "Could not save the auto-resume setting",
      defaultFailed: "Could not read the setting",
      defaultDescription: "New sessions start with the composer toggle on. A session's own toggle overrides this.",
    },
  },
  setup(ctx) {
    const rpc = () => ctx.client.rpc(UsageResume)

    // One reactive view of the server's state, refreshed by its `changed` event.
    const [version, setVersion] = createSignal(0)
    createKeyed(rpc, (client) => {
      onCleanup(client.events.on("changed", () => void setVersion((v) => v + 1)))
    })

    const defaults = createLatest(
      () => ({ version: version() }),
      async (_key, signal) => ((await rpc().getDefault({}, { signal })) as { enabled: boolean }).enabled,
    )
    const [pendingDefault, setPendingDefault] = createSignal<boolean | undefined>()

    ctx.add(SettingsPage, {
      id: "usage-resume",
      page: "general",
      section: "general",
      title: TITLE,
      entries: [{ id: SETTING_ID, title: TITLE, description: ctx.t("defaultDescription"), keywords: "usage limit resume claude" }],
      // The host's own row markup (title and description in the copy slot, the control in the control slot), so its CSS styles it.
      render: () => (
        <div data-component="settings-row">
          <div data-slot="settings-row-copy">
            <div data-slot="settings-row-title">{TITLE}</div>
            <div data-slot="settings-row-description">{defaults.error !== undefined ? ctx.t("defaultFailed") : ctx.t("defaultDescription")}</div>
          </div>
          <div data-slot="settings-row-control">
            <div data-action={SETTING_ID}>
              <ctx.ui.Switch
                label={TITLE}
                hideLabel
                checked={pendingDefault() ?? defaults.latest ?? false}
                disabled={defaults.error !== undefined}
                onChange={(checked) => {
                  setPendingDefault(checked)
                  rpc()
                    .setDefault({ enabled: checked }, { signal: ctx.signal })
                    .catch((error) => {
                      if (ctx.signal.aborted) return
                      console.warn("usage-resume: could not save the default:", error)
                      ctx.toast.show({ title: ctx.t("saveFailed"), variant: "error" })
                    })
                    .finally(() => {
                      setPendingDefault(undefined)
                      setVersion((v) => v + 1)
                    })
                }}
              />
            </div>
          </div>
        </div>
      ),
    })

    // The routed session's state. A read that fails is a state of its own (`failed`), shown as a danger pill.
    const sessionID = () => ctx.sessions.current()?.id
    const session = createLatest(
      () => {
        const id = sessionID()
        return id ? { id, version: version() } : undefined
      },
      async (key, signal): Promise<Loaded> => {
        const result = await rpc().get({ sessionID: key.id }, { signal })
        return { sessionID: key.id, state: result as SessionState }
      },
    )
    const [optimistic, setOptimistic] = createSignal<Loaded | undefined>()

    const toggle = (id: string, enabled: boolean) => {
      const current = session.latest
      if (current) setOptimistic({ sessionID: id, state: { ...current.state, enabled } })
      rpc()
        .set({ sessionID: id, enabled }, { signal: ctx.signal })
        .catch((error) => {
          if (ctx.signal.aborted) return
          console.warn("usage-resume: could not save the toggle:", error)
          ctx.toast.show({ title: ctx.t("saveFailed"), variant: "error" })
        })
        .finally(() => {
          setOptimistic(undefined)
          setVersion((v) => v + 1)
        })
    }

    ctx.add(ComposerPill, {
      id: "resume",
      show: (input) => {
        const id = input.session.id
        const spec = pillFor({
          sessionID: id,
          loaded: optimistic()?.sessionID === id ? optimistic() : session.latest,
          failed: session.error !== undefined,
          now: Date.now(),
          text: {
            title: ctx.t("title"),
            waiting: (time) => ctx.t("pillWaiting", { time }),
            off: ctx.t("pillOff"),
            failed: ctx.t("pillFailed"),
          },
        })
        if (!spec) return undefined
        const { toggleTo, ...view } = spec
        return { ...view, run: toggleTo === undefined ? undefined : () => toggle(id, toggleTo) }
      },
    })
  },
})
