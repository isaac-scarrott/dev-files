import { Rpc } from "@opencode/plugin/rpc"

/** The renderer cannot read the home directory, so the server part reports it. */
export const FileViewerRpc = Rpc.define({
  id: "file-viewer",
  methods: {
    home: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", properties: { home: { type: "string", minLength: 1 } }, required: ["home"], additionalProperties: false },
    },
  },
  events: {},
})
