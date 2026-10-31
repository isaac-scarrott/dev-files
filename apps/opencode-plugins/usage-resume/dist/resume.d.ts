import type { Plugin } from "@opencode/plugin";
import { type ErrorLike } from "./detect.js";
import type { Options } from "./options.js";
import { type Waiting } from "./plan.js";
import { UsageSource, type UsageState } from "./usage.js";
/** The slice of the plugin context the resumer uses; tests supply a fake. */
export type Host = Pick<Plugin.Context, "session" | "storage">;
export interface Attempts {
    count: number;
    lastAt: number;
}
export interface State {
    waiting: Record<string, Waiting>;
    attempts: Record<string, Attempts>;
    usage: UsageState;
}
export interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
}
export declare function emptyState(): State;
export declare function formatTime(at: number, now: number): string;
export declare class Resumer {
    private readonly host;
    private readonly options;
    private readonly clock;
    private readonly usage;
    private readonly state;
    private readonly log;
    private busy;
    private constructor();
    static create(host: Host, options: Options, clock: Clock, usageDeps: Omit<ConstructorParameters<typeof UsageSource>[0], "now" | "authDir" | "snapshotPath">, log?: (message: string) => void): Promise<Resumer>;
    /** Session IDs currently waiting, for tests and diagnostics. */
    waiting(): readonly Waiting[];
    attempts(sessionID: string): Attempts | undefined;
    /** A run failed. If it is a Claude usage limit, start waiting for it to clear. */
    onFailed(sessionID: string, error: ErrorLike | undefined, at: number): Promise<void>;
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
