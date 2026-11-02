import { createLatest } from "@opencode/plugin/gui"
import { nativeSessionID } from "./native"
import { measuredStep, type Learned, type Msg } from "./predict"

type Ask = (input: { sessionID: string; nativeSessionID?: string }, signal: AbortSignal) => Promise<unknown>

/**
 * The cache tier the session's transcript shows, asked of the server half once per new measured step (never on a
 * timer). The answer belongs to the step it was asked for: once a newer step arrives it is not used until that
 * step's own answer is in, so an old tier cannot outlive a newer write that shows another.
 */
export function createLearned(sessionID: () => string | undefined, messages: () => ReadonlyArray<Msg>, ask: Ask) {
  const key = () => {
    const id = sessionID()
    const step = measuredStep(messages())

    return id && step?.id ? `${id}\n${step.id}` : undefined
  }

  const answer = createLatest(key, async (value, signal) => {
    const [id] = value.split("\n")
    const native = nativeSessionID(messages())
    const reply = (await ask({ sessionID: id!, ...(native ? { nativeSessionID: native } : {}) }, signal)) as {
      ttl?: "5m" | "1h"
      at?: number
    }

    return { key: value, learned: reply.ttl && typeof reply.at === "number" ? ({ ttl: reply.ttl, at: reply.at } satisfies Learned) : undefined }
  })

  return (): Learned | undefined => (answer.latest?.key === key() ? answer.latest?.learned : undefined)
}
