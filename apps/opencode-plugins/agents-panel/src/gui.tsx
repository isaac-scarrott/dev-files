import { Command, Plugin, Slot, Store, Style } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createEffect, onCleanup, Show } from "solid-js"
import { closeSubagentTabs } from "./cleanup"
import { spinnerCss } from "../../native-ui/src"
import { styles } from "./panel"
import { installBackgroundOption } from "./setting"
import { SubagentsToggle } from "./toggle"

const OPTION_LABEL = "Panel"

export default Plugin.define({
  // Off until the user picks "Panel" in Settings > Timeline > Background activity.
  stores: {
    mode: Store.global(Schema.Struct({ enabled: Schema.Boolean }), { enabled: false }),
    // The user's choice for the floating window, hidden whenever the right panel opens.
    dock: Store.global(Schema.Struct({ visible: Schema.Boolean }), { visible: false }),
  },
  setup(ctx) {
    ctx.add(Style, `${styles}\n${spinnerCss}`)
    const enabled = () => ctx.stores.mode.value.enabled
    const background = installBackgroundOption({
      label: OPTION_LABEL,
      enabled,
      active: () => ctx.router.path().startsWith("/settings"),
      set: (value) => {
        if (value !== enabled()) ctx.stores.mode.update((draft) => { draft.enabled = value })
      },
    })
    onCleanup(background)
    createEffect(() => {
      enabled()
      ctx.router.path()
      background.refresh()
    })

    const visible = () => ctx.stores.dock.value.visible
    const dock = {
      visible,
      setVisible: (value: boolean) => {
        if (value !== visible()) ctx.stores.dock.update((draft) => { draft.visible = value })
      },
    }

    ctx.add(Command, {
      id: "close-tabs",
      title: "Close subagent tabs",
      description: "Closes sidebar tabs of subagent sessions; they stay in Recently closed",
      section: "session",
      run: () => {
        closeSubagentTabs(ctx)
      },
    })

    ctx.add(Slot, {
      at: "session.header",
      render: (input) => (
        <Show when={enabled()}>
          <SubagentsToggle ctx={ctx} input={input} dock={dock} />
        </Show>
      ),
    })
  },
})
