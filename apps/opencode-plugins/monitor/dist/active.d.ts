/**
 * What the monitor plugin is running, for other plugins: the process groups it owns must never be mistaken for a shell's
 * and never signalled. Kept on `globalThis` under a `Symbol.for` key as a function, so a second plugin (session-procs,
 * a separate package) can read it without importing this one, and a hot reload keeps the same function.
 */
export interface ActiveMonitor {
    readonly sessionID: string;
    readonly pgid: number;
}
export type ActiveSource = () => readonly ActiveMonitor[];
/** The live query, or `undefined` when the monitor plugin is not loaded (session-procs then never idle-reaps). */
export declare function activeMonitors(): ActiveMonitor[] | undefined;
/** This plugin instance's monitors join the process-wide answer. The returned function takes them out again. */
export declare function publishActive(source: ActiveSource): () => void;
