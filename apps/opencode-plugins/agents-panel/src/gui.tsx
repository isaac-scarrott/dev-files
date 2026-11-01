import { Command, Plugin, Slot, Store, Style } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createEffect, onCleanup, Show } from "solid-js"
import { cleanupOnce, closeSubagentTabs } from "./cleanup"
import { styles } from "./panel"
import { createSidebar, dockState } from "./dock"
import { installBackgroundOption } from "./setting"
import { SubagentsToggle } from "./toggle"

const OPTION_LABEL = "Panel"

export default Plugin.define({
  // Off until the user picks "Panel" in Settings > Timeline > Background activity.
  stores: {
    mode: Store.global(Schema.Struct({ enabled: Schema.Boolean }), { enabled: false }),
    // The user's choice for the floating window, kept while the left sidebar is open or closed.
    dock: Store.global(Schema.Struct({ visible: Schema.Boolean }), { visible: false }),
  },
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

    const { sidebar, width: asideWidth } = createSidebar()
    const visible = () => ctx.stores.dock.value.visible
    const dock = {
      sidebar,
      asideWidth,
      visible,
      setVisible: (value: boolean) => {
        if (value !== visible()) ctx.stores.dock.update((draft) => { draft.visible = value })
      },
    }
    // Opening the sidebar hides the window for good: the stored choice becomes hidden, so closing the sidebar later starts without it.
    createEffect(() => {
      if (sidebar() === "open") dock.setVisible(false)
    })
    // The chat row reserves the window's width through this variable (see the dock rules in panel.tsx).
    createEffect(() => {
      const inset = dockState({ enabled: enabled(), sidebar: sidebar(), visible: visible() }).inset
      document.documentElement.style.setProperty("--agents-dock-pad", `${inset}px`)
      onCleanup(() => document.documentElement.style.removeProperty("--agents-dock-pad"))
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
          <SubagentsToggle ctx={ctx} input={input} dock={dock} />
        </Show>
      ),
    })
  },
})
