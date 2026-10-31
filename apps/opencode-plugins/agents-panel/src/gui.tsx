import { Command, Plugin, Slot, Store, Style } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createEffect, onCleanup, Show } from "solid-js"
import { cleanupOnce, closeSubagentTabs } from "./cleanup"
import { styles } from "./panel"
import { installBackgroundOption } from "./setting"
import { SubagentsToggle } from "./toggle"

const OPTION_LABEL = "Subagents panel"

export default Plugin.define({
  // Off until the user picks "Subagents panel" in Settings > Timeline > Background activity.
  stores: { mode: Store.global(Schema.Struct({ enabled: Schema.Boolean }), { enabled: false }) },
  setup(ctx) {
    ctx.add(Style, styles)
    const enabled = () => ctx.stores.mode.value.enabled
    const background = installBackgroundOption({
      label: OPTION_LABEL,
      enabled,
      set: (value) => {
        if (value !== enabled()) ctx.stores.mode.update((draft) => { draft.enabled = value })
      },
    })
    onCleanup(background)
    createEffect(() => {
      enabled()
      background.refresh()
    })

    ctx.add(Command, {
      id: "close-tabs",
      title: "Close subagent tabs",
      description: "Closes sidebar tabs of subagent sessions; they stay in Recently closed",
      section: "session",
      run: () => {
        closeSubagentTabs(ctx)
      },
    })

    const cleanup = cleanupOnce(ctx)
    createEffect(cleanup)

    ctx.add(Slot, {
      at: "session.header",
      render: (input) => (
        <Show when={enabled()}>
          <SubagentsToggle ctx={ctx} input={input} />
        </Show>
      ),
    })
  },
})
