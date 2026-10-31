import { Plugin, Slot, Style } from "@opencode/plugin/gui"
import { styles } from "./panel"
import { SubagentsToggle } from "./toggle"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, styles)

    ctx.add(Slot, {
      at: "session.header",
      render: (input) => <SubagentsToggle ctx={ctx} input={input} />,
    })
  },
})
