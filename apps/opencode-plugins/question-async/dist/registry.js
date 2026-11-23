const SHARED_KEY = Symbol.for("opencode.question-async.pending");
/**
 * Join this process's registry, loading it from storage on the first join. Instances that load after a request was
 * stored keep the same map, so they do not each get their own copy of it.
 */
export async function acquire(load) {
    const slot = globalThis;
    let shared = slot[SHARED_KEY];
    if (!shared) {
        shared = { pending: new Map() };
        slot[SHARED_KEY] = shared;
    }
    const target = shared;
    if (target.seed === undefined) {
        const seeding = (async () => {
            // A request that was claimed but never got its form goes back to waiting for a window.
            for (const request of (await load()) ?? [])
                target.pending.set(request.requestID, { ...request, claimed: !!request.formID });
        })();
        target.seed = seeding;
        // A failed load should not leave every later instance awaiting the same rejection.
        seeding.catch(() => {
            if (target.seed === seeding)
                target.seed = undefined;
        });
    }
    await target.seed;
    return target;
}
/** Tests get a fresh process-like view: the singleton is removed. */
export function resetShared() {
    const slot = globalThis;
    delete slot[SHARED_KEY];
}
