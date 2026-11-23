import type { Asked } from "./rpc.js"

export type Pending = Asked & { claimed: boolean; formID?: string }

/**
 * The one pending registry of this service process. The host loads one plugin instance per directory, and every
 * instance hears every form event: a per-instance map would deliver one answer or dismissal once per instance. So the
 * map lives here, held on `globalThis`, and a delivery takes its request out before sending.
 *
 * It holds no `ctx`: the instance that handles an event calls `ctx.session.synthetic` itself, so a disposed instance
 * never leaves the registry pointing at a dead host.
 */
export interface Shared {
  readonly pending: Map<string, Pending>
  /** The storage load happens once per process; every instance waits for the same one. */
  seed?: Promise<void>
}

const SHARED_KEY = Symbol.for("opencode.question-async.pending")

/**
 * Join this process's registry, loading it from storage on the first join. Instances that load after a request was
 * stored keep the same map, so they do not each get their own copy of it.
 */
export async function acquire(load: () => Promise<Pending[] | undefined>): Promise<Shared> {
  const slot = globalThis as unknown as Record<symbol, Shared | undefined>
  let shared = slot[SHARED_KEY]
  if (!shared) {
    shared = { pending: new Map() }
    slot[SHARED_KEY] = shared
  }
  const target = shared
  if (target.seed === undefined) {
    const seeding = (async () => {
      // A request that was claimed but never got its form goes back to waiting for a window.
      for (const request of (await load()) ?? []) target.pending.set(request.requestID, { ...request, claimed: !!request.formID })
    })()
    target.seed = seeding
    // A failed load should not leave every later instance awaiting the same rejection.
    seeding.catch(() => {
      if (target.seed === seeding) target.seed = undefined
    })
  }
  await target.seed
  return target
}

/** Tests get a fresh process-like view: the singleton is removed. */
export function resetShared(): void {
  const slot = globalThis as unknown as Record<symbol, Shared | undefined>
  delete slot[SHARED_KEY]
}
