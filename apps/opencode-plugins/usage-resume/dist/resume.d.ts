import type { Plugin } from "@opencode/plugin";
import { type ErrorLike } from "./detect.js";
import type { Options } from "./options.js";
import { type Waiting } from "./plan.js";
import { type Samples } from "./diag.js";
import type { Toggles } from "./toggles.js";
import { type UsageSource } from "./usage.js";
/** The slice of the plugin context the resumer uses; tests supply a fake. */
export type Host = Pick<Plugin.Context, "session" | "storage">;
export interface Attempts {
    count: number;
    lastAt: number;
}
/** A session whose last run hit a usage limit, whether or not it opted in to resuming. */
export interface Limited {
    at: number;
    kind?: string;
    resetsAt?: number;
}
export interface State {
    waiting: Record<string, Waiting>;
    attempts: Record<string, Attempts>;
    limited: Record<string, Limited>;
}
export interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
}
export declare function emptyState(): State;
/** One state key per project location: the server runs one plugin instance per location over one shared storage. */
export declare function stateKey(directory: string): string;
export declare function formatTime(at: number, now: number): string;
export declare class Resumer {
    private readonly host;
    private readonly options;
    private readonly clock;
    private readonly usage;
    private readonly state;
    private readonly toggles;
    private readonly samples;
    private readonly directory;
    private readonly key;
    private readonly log;
    private busy;
    /** Called with a session id when what the GUI shows for it may have changed. */
    changed: (sessionID: string) => void;
    private constructor();
    static create(host: Host, options: Options, clock: Clock, usage: UsageSource, toggles: Toggles, samples: Samples, 
    /** The project location this instance serves; it acts only on sessions that live there. */
    directory: string, log?: (message: string) => void): Promise<Resumer>;
    /** Session IDs currently waiting, for tests and diagnostics. */
    waiting(): readonly Waiting[];
    /**
     * The usage limit the session is stopped at, while it is stopped: set when a run fails on the limit, cleared when the
     * session moves on, and ignored once a stated reset time has passed (nothing would clear it for an opted-out session).
     */
    limited(sessionID: string): {
        resumesAt?: number;
    } | undefined;
    /** The session's toggle was turned on: if it is stopped at a limit now, start waiting for it. */
    optIn(sessionID: string): Promise<void>;
    /** The session's toggle was turned off: stop waiting for it. */
    optOut(sessionID: string): Promise<void>;
    attempts(sessionID: string): Attempts | undefined;
    /** A run failed. If it is a Claude usage limit and the session's toggle is on, start waiting for it to clear. */
    onFailed(sessionID: string, error: ErrorLike | undefined, at: number): Promise<void>;
    private skip;
    /** The session moved on without us (a user prompt, a run, deletion, completion): stop waiting for it. */
    onSettled(sessionID: string, completed?: boolean): Promise<void>;
    /** Look at every waiting session that is due. Call on an interval; after sleep the first call catches up. */
    tick(): Promise<void>;
    private register;
    private evaluate;
    private process;
    private drop;
    private announce;
    /** A timeline notice that does not wake the session. */
    private notice;
    private save;
}
