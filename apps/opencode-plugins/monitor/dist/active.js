/**
 * What the monitor plugin is running, for other plugins: the process groups it owns must never be mistaken for a shell's
 * and never signalled. Kept on `globalThis` under a `Symbol.for` key as a function, so a second plugin (session-procs,
 * a separate package) can read it without importing this one, and a hot reload keeps the same function.
 */
const KEY = Symbol.for("opencode.monitor.active");
function query() {
    const global = globalThis;
    const existing = global[KEY];
    if (existing)
        return existing;
    const sources = new Set();
    const created = Object.assign(() => [...sources].flatMap((source) => [...source()]), { sources });
    global[KEY] = created;
    return created;
}
/** The live query, or `undefined` when the monitor plugin is not loaded (session-procs then never idle-reaps). */
export function activeMonitors() {
    const global = globalThis;
    const query = global[KEY];
    if (typeof query !== "function")
        return undefined;
    try {
        return query();
    }
    catch {
        return undefined;
    }
}
/** This plugin instance's monitors join the process-wide answer. The returned function takes them out again. */
export function publishActive(source) {
    const { sources } = query();
    sources.add(source);
    return () => void sources.delete(source);
}
//# sourceMappingURL=active.js.map