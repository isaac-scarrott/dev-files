import { Command, Plugin, Slot, Style } from "@opencode/plugin/gui"
import { createEffect } from "solid-js"
import { cleanupOnce, closeSubagentTabs } from "./cleanup"
import { styles } from "./panel"
import { SubagentsToggle } from "./toggle"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, styles)

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
      render: (input) => <SubagentsToggle ctx={ctx} input={input} />,
    })
  },
})
