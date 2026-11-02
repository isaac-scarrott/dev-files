export interface Clock {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}
export declare const systemClock: Clock;
export interface ChildEvents {
    data(chunk: Buffer): void;
    /** Called once, after the process ended and its output was read (or gave up waiting for it). */
    exit(code: number | null, signal: string | null): void;
}
export interface Child {
    /** Signals the whole process group, so grandchildren die too. */
    kill(signal: "SIGTERM" | "SIGKILL"): void;
    readonly pid?: number;
}
export type Spawn = (spec: {
    command: string;
    cwd: string;
}, events: ChildEvents) => Child;
/** Runs `command` in the user's shell as the leader of its own process group, stdout and stderr merged. */
export declare const spawnShell: Spawn;
