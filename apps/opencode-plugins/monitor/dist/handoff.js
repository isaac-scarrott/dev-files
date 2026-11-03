/**
 * A plugin hot reload loads the module again inside the same service process, so the old instance's monitors can be
 * handed to the new instance with their processes still running. Everything here is plain data and functions over it,
 * kept on `globalThis` under a `Symbol.for` key: classes from an older copy of the module would otherwise run on.
 */
const KEY = Symbol.for("opencode.monitor.handoff");
/** A parked monitor nobody claims within this long is killed (its instance never came back). */
export const PARK_MS = 30_000;
const REPLAY_CAP_BYTES = 1 << 20;
/** Output and exit of a child's pipes, delivered to whoever is attached; held while nobody is. */
export class Port {
    target;
    chunks = [];
    bytes = 0;
    ended;
    data(chunk) {
        if (this.target)
            return this.target.data(chunk);
        if (this.bytes + chunk.length > REPLAY_CAP_BYTES)
            return;
        this.chunks.push(chunk);
        this.bytes += chunk.length;
    }
    exit(code, signal) {
        if (this.target)
            return this.target.exit(code, signal);
        this.ended = { code, signal };
    }
    detach() {
        this.target = undefined;
    }
    /** Replays what arrived while nobody was attached, then the exit if the process ended meanwhile. */
    attach(target) {
        this.target = target;
        const chunks = this.chunks;
        this.chunks = [];
        this.bytes = 0;
        for (const chunk of chunks)
            target.data(chunk);
        const ended = this.ended;
        this.ended = undefined;
        if (ended)
            target.exit(ended.code, ended.signal);
    }
}
export const newRegistry = () => ({ live: new Map(), parked: new Map(), shuttingDown: false });
/** Ends a handed-off process: SIGTERM, SIGKILL after the grace. */
export function killParked(handoff, clock, graceMs) {
    const child = handoff.child;
    if (!child)
        return;
    child.kill("SIGTERM");
    clock.setTimeout(() => child.kill("SIGKILL"), graceMs);
}
export function park(registry, handoff, clock, graceMs, log) {
    const id = handoff.def.id;
    const timer = clock.setTimeout(() => {
        if (registry.parked.get(id)?.handoff !== handoff)
            return;
        registry.parked.delete(id);
        log(`${id} (${handoff.def.name}): not claimed after a reload; ended`);
        killParked(handoff, clock, graceMs);
    }, PARK_MS);
    registry.parked.set(id, { handoff, timer, clock });
}
/** Exactly one caller gets a monitor: the entry is removed in the same tick. A live one is taken from its owner. */
export function claim(registry, id) {
    const parked = registry.parked.get(id);
    if (parked) {
        registry.parked.delete(id);
        parked.clock.clearTimeout(parked.timer);
        return parked.handoff;
    }
    const live = registry.live.get(id);
    if (live) {
        registry.live.delete(id);
        return live.detach();
    }
    return undefined;
}
/** The process is shutting down: SIGTERM everything handed off, SIGKILL after the grace. */
export function beginShutdown(registry, graceMs) {
    registry.shuttingDown = true;
    for (const { handoff, clock, timer } of registry.parked.values()) {
        clock.clearTimeout(timer);
        killParked(handoff, clock, graceMs);
    }
    registry.parked.clear();
}
function killEverything(registry) {
    for (const live of registry.live.values()) {
        live.kill("SIGTERM");
        live.kill("SIGKILL");
    }
    for (const { handoff } of registry.parked.values()) {
        handoff.child?.kill("SIGTERM");
        handoff.child?.kill("SIGKILL");
    }
}
const SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"];
/** The registry shared by every copy of this module in the process. Hooks that end processes at shutdown are installed once. */
export function globalRegistry(graceMs) {
    const slot = globalThis;
    const existing = slot[KEY];
    if (existing)
        return existing;
    const registry = newRegistry();
    slot[KEY] = registry;
    // The host already handles these and runs its own shutdown; ours only notes that this is not a reload. A signal
    // nobody listens to is left alone, since a listener of ours would stop it from ending the process.
    for (const signal of SIGNALS)
        if (process.listenerCount(signal) > 0)
            process.on(signal, () => beginShutdown(registry, graceMs));
    // Backstop for any other way out: the process groups must not outlive the service.
    process.on("exit", () => killEverything(registry));
    return registry;
}
//# sourceMappingURL=handoff.js.map