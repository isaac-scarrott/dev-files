import { Plugin, Style } from "@opencode/plugin/gui"
import { toastCss } from "./style"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, toastCss())
  },
})
