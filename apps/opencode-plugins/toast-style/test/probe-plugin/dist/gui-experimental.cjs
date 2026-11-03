// Harness only: hands the page `ctx.toast` and `ctx` so markup-probe.mjs can raise toasts of every shape. Register it beside toast-style in the private harness, never in opencode.json.
"use strict"
const gui = require("@opencode/plugin/gui")
exports.default = gui.Plugin.define({
  setup(ctx) {
    globalThis.__toast = ctx.toast
    globalThis.__ctx = ctx
    return () => void (delete globalThis.__toast, delete globalThis.__ctx)
  },
})
