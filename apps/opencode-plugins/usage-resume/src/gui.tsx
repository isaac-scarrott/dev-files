import { Plugin, SettingsPage, Style } from "@opencode/plugin/gui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { render } from "solid-js/web"
import { MOUNT_ATTR, placeMount, visibleControls } from "./composer.js"
import { UsageResume } from "./rpc.js"

const TITLE = "Auto-resume after usage limit"
const SETTING_ID = "usage-resume-default"

// `display: contents` keeps our wrapper from becoming a flex item of its own: the button sits in the row as a sibling.
const css = `[${MOUNT_ATTR}] { display: contents; }`

export default Plugin.define({
  i18n: {
    en: {
      title: TITLE,
      tooltipOn: "Auto-resume after usage limit: on. Resumes this session when usage is available again.",
      tooltipOff: "Auto-resume after usage limit: off. Turn on to resume this session when usage is available again.",
      defaultDescription: "New sessions start with the composer toggle on. A session's own toggle overrides this.",
    },
  },
  setup(ctx) {
    ctx.add(Style, css)
    const rpc = () => ctx.client.rpc(UsageResume)

    // One reactive view of the server's state, refreshed by its `changed` event.
    const [version, setVersion] = createSignal(0)
    createEffect(() => {
      const off = rpc().events.on("changed", () => void setVersion((v) => v + 1))
      onCleanup(off)
    })

    const [defaultOn, setDefaultOn] = createSignal(false)
    createEffect(() => {
      version()
      void rpc()
        .getDefault({}, { signal: ctx.signal })
        .then((r) => setDefaultOn((r as { enabled: boolean }).enabled))
        .catch(() => {})
    })

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
            <div data-slot="settings-row-description">{ctx.t("defaultDescription")}</div>
          </div>
          <div data-slot="settings-row-control">
            <div data-action={SETTING_ID}>
              <ctx.ui.Switch
                label={TITLE}
                hideLabel
                checked={defaultOn()}
                onChange={(checked) => {
                  setDefaultOn(checked)
                  void rpc().setDefault({ enabled: checked }, { signal: ctx.signal }).catch(() => setVersion((v) => v + 1))
                }}
              />
            </div>
          </div>
        </div>
      ),
    })

    // The routed session's state; undefined until read, `available: false` for a subagent.
    const [state, setState] = createSignal<{ enabled: boolean; available: boolean } | undefined>()
    const sessionID = () => ctx.sessions.current()?.id
    createEffect(() => {
      const id = sessionID()
      version()
      if (!id) return setState(undefined)
      const controller = new AbortController()
      onCleanup(() => controller.abort())
      void rpc()
        .get({ sessionID: id }, { signal: controller.signal })
        .then((r) => !controller.signal.aborted && setState(r as { enabled: boolean; available: boolean }))
        .catch(() => !controller.signal.aborted && setState(undefined))
    })

    const toggle = () => {
      const id = sessionID()
      const current = state()
      if (!id || !current) return
      const next = !current.enabled
      setState({ ...current, enabled: next })
      void rpc().set({ sessionID: id, enabled: next }, { signal: ctx.signal }).catch(() => setVersion((v) => v + 1))
    }

    const Button = () => (
      <Show when={state()?.available}>
        <ctx.ui.Tooltip value={state()?.enabled ? ctx.t("tooltipOn") : ctx.t("tooltipOff")} placement="top">
          <ctx.ui.IconButton
            icon="refresh"
            size="large"
            variant="ghost-muted"
            label={TITLE}
            pressed={state()?.enabled === true}
            onClick={toggle}
          />
        </ctx.ui.Tooltip>
      </Show>
    )

    // The host renders the composer row itself and can replace it; the button is placed again whenever the DOM moves.
    let disposeButton: (() => void) | undefined
    let mountedIn: HTMLElement | undefined
    const place = () => {
      const row = visibleControls(document)
      if (!row) return
      if (mountedIn && mountedIn.isConnected && mountedIn.parentElement === row) return
      disposeButton?.()
      mountedIn?.remove()
      mountedIn = placeMount(row, () => document.createElement("span"))
      disposeButton = render(Button, mountedIn as HTMLElement)
    }
    let queued = false
    const schedule = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        place()
      })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", schedule)
    createEffect(() => {
      sessionID()
      schedule()
    })
    schedule()

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      disposeButton?.()
      mountedIn?.remove()
    }
  },
})
