import { sourceOfEvent } from "../../native-ui/src/notify-contract"

export interface RpcEvent {
  readonly source: string
  readonly data: unknown
}

export const BACKOFF_START_MS = 1_000
export const BACKOFF_MAX_MS = 30_000

/**
 * Reads every `rpc.<id>.notify` event from the client's event stream: the server halves of the plugins publish
 * through those, and the hub needs no import of their definitions. A dropped stream restarts with backoff; an event
 * resets the backoff.
 */
export async function readRpcEvents(input: {
  readonly subscribe: (signal: AbortSignal) => AsyncIterable<{ type?: unknown; data?: unknown }>
  readonly signal: AbortSignal
  readonly onEvent: (event: RpcEvent) => void
  readonly wait: (ms: number, signal: AbortSignal) => Promise<void>
}): Promise<void> {
  let delay = BACKOFF_START_MS
  while (!input.signal.aborted) {
    try {
      for await (const event of input.subscribe(input.signal)) {
        const source = sourceOfEvent(event.type)
        if (!source) continue
        delay = BACKOFF_START_MS
        input.onEvent({ source, data: event.data })
      }
    } catch {
      if (input.signal.aborted) return
    }
    if (input.signal.aborted) return
    await input.wait(delay, input.signal)
    delay = Math.min(delay * 2, BACKOFF_MAX_MS)
  }
}
