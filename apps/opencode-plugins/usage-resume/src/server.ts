import { Plugin } from "@opencode/plugin"
import { detectUsageLimit } from "./detect.js"
import { parseOptions } from "./options.js"
import { Resumer, type Clock } from "./resume.js"

const EVENTS = [
  "session.execution.failed",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.interrupted",
  "session.deleted",
  "session.inbox.enqueued",
] as const

const RESUBSCRIBE_MS = 5_000

const clock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export default Plugin.define({
  id: "usage-resume",
  async setup(ctx) {
    const options = parseOptions(ctx.options)
    const log = (message: string) => console.error(`[usage-resume] ${message}`)
    const resumer = await Resumer.create(ctx, options, clock, { random: Math.random, fetch }, log)
    const abort = new AbortController()

    // OpenCode retries a failed request with backoff; a usage limit lasts hours, so end the run and let us wait.
    const retry = await ctx.session.hook("retry", (event) => {
      if (detectUsageLimit(event.error, Date.now())) event.decision = { retry: false }
    })

    const listen = async () => {
      while (!abort.signal.aborted) {
        try {
          for await (const event of ctx.event.subscribe({ types: [...EVENTS], signal: abort.signal })) {
            const sessionID = event.data.sessionID
            switch (event.type) {
              case "session.execution.failed":
                await resumer.onFailed(sessionID, event.data.error, event.created)
                break
              case "session.execution.succeeded":
                await resumer.onSettled(sessionID, true)
                break
              case "session.inbox.enqueued":
                // Our own notices are synthetic; only a person's message means they are back in the session.
                if (event.data.item.type === "user") await resumer.onSettled(sessionID)
                break
              default:
                await resumer.onSettled(sessionID)
            }
          }
        } catch (error) {
          if (abort.signal.aborted) return
          log(`event stream ended: ${String(error)}`)
        }
        await clock.sleep(RESUBSCRIBE_MS)
      }
    }
    void listen()

    void resumer.tick()
    const timer = setInterval(() => void resumer.tick(), options.tickMs)

    return async () => {
      abort.abort()
      clearInterval(timer)
      await retry.dispose()
    }
  },
})
