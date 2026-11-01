import { Plugin } from "@opencode/plugin"
import { nativeSessionID } from "./native.js"
import { CacheTtl } from "./rpc.js"
import { Transcripts } from "./transcript.js"

export default Plugin.define({
  id: "cache-warning",
  async setup(ctx) {
    const transcripts = new Transcripts()

    const rpc = await ctx.rpc.register(CacheTtl, {
      learn: async (input) => {
        const { sessionID, nativeSessionID: given } = input as { sessionID: string; nativeSessionID?: string }
        const info = await ctx.session.get({ sessionID }).catch(() => undefined)
        // The window already holds the messages; the server's own context is the fallback.
        const nativeID = given ?? nativeSessionID(info ? await ctx.session.context({ sessionID }).catch(() => []) : [])
        const learned = nativeID ? await transcripts.learn(nativeID, info?.location.directory) : undefined
        return learned ?? {}
      },
    })

    return async () => {
      await rpc.dispose()
    }
  },
})
