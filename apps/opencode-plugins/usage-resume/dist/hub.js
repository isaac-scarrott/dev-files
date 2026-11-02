import { emptyUsageState, UsageSource } from "./usage.js";
const KEY = "usage/v1";
/** A usage source whose readings and backoff schedules persist under one shared storage key. */
export async function createUsageSource(storage, deps) {
    const stored = (await storage.get(KEY).catch(() => undefined));
    const state = { ...emptyUsageState(), ...stored };
    return new UsageSource(deps, state, () => storage.set(KEY, state));
}
const hubs = new Map();
/**
 * The server loads this plugin once per project location, all in one process and sharing one storage. Each instance
 * would otherwise poll the usage endpoint and persist its own copy, tripling the load on an endpoint that rate-limits
 * hard. Instances share one source per auth directory and the last one out releases it.
 */
export function acquireUsage(storage, deps) {
    let entry = hubs.get(deps.authDir);
    if (!entry) {
        entry = { source: createUsageSource(storage, deps), refs: 0 };
        hubs.set(deps.authDir, entry);
    }
    entry.refs += 1;
    const held = entry;
    return {
        source: held.source,
        release() {
            held.refs -= 1;
            if (held.refs <= 0 && hubs.get(deps.authDir) === held)
                hubs.delete(deps.authDir);
        },
    };
}
//# sourceMappingURL=hub.js.map