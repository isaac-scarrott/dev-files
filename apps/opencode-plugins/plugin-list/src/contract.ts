import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"

export const PluginConfig = Ipc.define({
  id: "plugin-list",
  methods: {
    disabled: { output: Schema.Array(Schema.String) },
    set: { input: Schema.Struct({ name: Schema.String, enabled: Schema.Boolean }) },
  },
})
