/**
 * Identifies the service process. A plugin hot reload loads this module again inside the same process, so the id is kept
 * on `globalThis` under a `Symbol.for` key and every copy of the module agrees on it; a real restart is a new process and
 * gets a new one. The pid plus the start time cannot repeat, even when the OS reuses the pid.
 */
const KEY = Symbol.for("opencode.shell-handoff.boot");
export function bootId() {
    const slot = globalThis;
    const existing = slot[KEY];
    if (existing)
        return existing;
    const id = `${process.pid}:${Math.round(Date.now() - process.uptime() * 1000)}`;
    slot[KEY] = id;
    return id;
}
