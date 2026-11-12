import type { Definition } from "./monitor.js";
import type { Child, ChildEvents, Clock } from "./process.js";
/** A parked monitor nobody claims within this long is killed (its instance never came back). */
export declare const PARK_MS = 30000;
/** Output and exit of a child's pipes, delivered to whoever is attached; held while nobody is. */
export declare class Port implements ChildEvents {
    private target;
    private chunks;
    private bytes;
    private ended;
    data(chunk: Buffer): void;
    exit(code: number | null, signal: string | null): void;
    detach(): void;
    /** Replays what arrived while nobody was attached, then the exit if the process ended meanwhile. */
    attach(target: ChildEvents): void;
}
/** The in-memory part of a monitor that the persisted run state does not hold. */
export interface Memory {
    seq: number;
    restartCount: number;
    restartNotice: number | undefined;
    state: "running" | "waiting" | "ended";
    startedAt: number;
    events: number;
    lastEventAt: number | undefined;
    paused: boolean;
    lastRearmAt: number | undefined;
    nextRearmAt: number | undefined;
    pending: string[];
    pendingBytes: number;
    dropped: number;
    notes: string[];
    window: number[];
    failures: number;
    cycling: boolean;
    splitter: unknown;
    /** The newest matching lines, for a wait that has not produced a batch yet. */
    recent: string[];
    /** The last process exit, for a wait that returns at once after the monitor ended. */
    lastExit: {
        code: number | null;
        signal: string | null;
    } | undefined;
}
export interface Handoff {
    readonly def: Definition;
    readonly child: Child | undefined;
    readonly port: Port | undefined;
    readonly memory: Memory;
}
interface Live {
    readonly owner: unknown;
    /** Takes the monitor away from its owner without touching the process. */
    detach(): Handoff;
    /** Ends the process group now (last resort, at process exit). */
    kill(signal: "SIGTERM" | "SIGKILL"): void;
}
interface Parked {
    readonly handoff: Handoff;
    readonly timer: unknown;
    readonly clock: Clock;
}
export interface Registry {
    readonly live: Map<string, Live>;
    readonly parked: Map<string, Parked>;
    /** The service is going away for real: a dispose ends processes instead of parking them. */
    shuttingDown: boolean;
}
export declare const newRegistry: () => Registry;
/** Ends a handed-off process: SIGTERM, SIGKILL after the grace. */
export declare function killParked(handoff: Handoff, clock: Clock, graceMs: number): void;
export declare function park(registry: Registry, handoff: Handoff, clock: Clock, graceMs: number, log: (message: string) => void): void;
/** Exactly one caller gets a monitor: the entry is removed in the same tick. A live one is taken from its owner. */
export declare function claim(registry: Registry, id: string): Handoff | undefined;
/** The process is shutting down: SIGTERM everything handed off, SIGKILL after the grace. */
export declare function beginShutdown(registry: Registry, graceMs: number): void;
/** The registry shared by every copy of this module in the process. Hooks that end processes at shutdown are installed once. */
export declare function globalRegistry(graceMs: number): Registry;
export {};
