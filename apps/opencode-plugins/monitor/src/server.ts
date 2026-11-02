import { Plugin } from "@opencode/plugin"
import { createLog } from "./diag.js"
import { Monitors, type Sessions, type Store } from "./manager.js"
import { parseOptions } from "./options.js"
import { spawnShell, systemClock } from "./process.js"
import { monitorControl } from "./control.js"
import { MonitorControl } from "./rpc.js"
import { registerTools } from "./tools.js"

const METADATA_KEY = "monitor"

export default Plugin.define({
  id: "monitor",
  async setup(ctx) {
    const options = parseOptions(ctx.options)
    const log = createLog(options.logDir, () => Date.now())
    const store: Store = {
      get: (key) => ctx.storage.get(key),
      set: (key, value) => ctx.storage.set(key, value as never),
      remove: (key) => ctx.storage.remove(key),
      scan: async (prefix) => {
        const found: { key: string; value: unknown }[] = []
        let after: string | undefined
        do {
          const page = await ctx.storage.scan({ prefix, after, limit: 100 })
          found.push(...page.entries.map((entry) => ({ key: entry.key, value: entry.value })))
          after = page.next
        } while (after)
        return found
      },
    }
    const sessions: Sessions = {
      state: async (sessionID) => {
        const info = await ctx.session.get({ sessionID: sessionID as never }).catch(() => undefined)
        return info ? (info.time.archived ? "archived" : "active") : undefined
      },
      // Always straight into the session, idle or busy; the caller never chooses.
      prompt: async (sessionID, text, meta) => {
        await ctx.session.prompt({ sessionID: sessionID as never, text, delivery: "steer", metadata: { [METADATA_KEY]: meta } })
      },
    }
    const monitors = new Monitors({ options, clock: systemClock, spawn: spawnShell, store, sessions, log, origin: ctx.location.directory })
    const tools = await ctx.tool.transform((editor) => registerTools(editor, monitors, ctx, options))
    await monitors.restore()

    // The desktop row's Stop button. A monitor belongs to one session, and only that session's row may stop it.
    const handlers = monitorControl(monitors)
    const control = await ctx.rpc.register(MonitorControl, {
      running: (input) => handlers.running(input as Parameters<typeof handlers.running>[0]),
      list: (input) => handlers.list(input as Parameters<typeof handlers.list>[0]),
      stop: (input) => handlers.stop(input as Parameters<typeof handlers.stop>[0]),
    })

    const abort = new AbortController()
    const listen = async () => {
      while (!abort.signal.aborted) {
        try {
          for await (const event of ctx.event.subscribe({ types: ["session.deleted", "session.archived"], signal: abort.signal })) {
            await monitors.removeSession(event.data.sessionID)
          }
        } catch (error) {
          if (abort.signal.aborted) return
          log(`event stream ended: ${String(error)}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
    void listen()
    log(`loaded for ${ctx.location.directory}; logs in ${options.logDir}`)

    return async () => {
      abort.abort()
      await control.dispose()
      await tools.dispose()
      await monitors.dispose()
    }
  },
})
