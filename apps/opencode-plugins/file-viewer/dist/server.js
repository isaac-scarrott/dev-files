import { homedir } from "node:os";
import { Plugin } from "@opencode/plugin";
import { FileViewerRpc } from "./rpc.js";
export default Plugin.define({
    id: "file-viewer",
    async setup(ctx) {
        await ctx.rpc.register(FileViewerRpc, { home: async () => ({ home: homedir() }) });
    },
});
