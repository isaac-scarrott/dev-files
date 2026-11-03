import { Plugin } from "@opencode/plugin"
import { createLog } from "./diag.js"
import { scheduleControl } from "./control.js"
import { acquire } from "./hub.js"
import type { Notify } from "./notify.js"
import { parseOptions } from "./options.js"
import { ScheduleControl } from "./rpc.js"
import { registerTools } from "./tools.js"

const clock = { now: () => Date.now() }

export default Plugin.define({
  id: "scheduler",
  async setup(ctx) {
    const options = parseOptions(ctx.options)
    const log = createLog(options.logDir, clock.now)
    // Registered below; until then (and after the cleanup starts) there is nowhere to send.
    let control: Awaited<ReturnType<typeof ctx.rpc.register<typeof ScheduleControl>>> | undefined
    const notify: Notify = (notification) => void control?.events.emit("notify", { ...notification }).catch((error) => log(`could not send a notification: ${String(error)}`))
    const { hub, release } = await acquire(ctx, options, clock, log, notify)
    const tools = await ctx.tool.transform((editor) => registerTools(editor, ctx, hub, options))
    // The desktop row's Cancel button.
    const handlers = scheduleControl(hub)
    control = await ctx.rpc.register(ScheduleControl, {
      active: (input) => handlers.active(input as Parameters<typeof handlers.active>[0]),
      pending: (input) => handlers.pending(input as Parameters<typeof handlers.pending>[0]),
      cancel: (input) => handlers.cancel(input as Parameters<typeof handlers.cancel>[0]),
    })
    return async () => {
      const registered = control
      control = undefined
      await registered?.dispose()
      await tools.dispose()
      release()
    }
  },
})
