import type { Host } from "./host.js";
export type WaitState = "finished" | "running" | "deleted" | "missing";
export interface WaitResult {
    readonly sessionID: string;
    readonly state: WaitState;
    readonly outcome?: "succeeded" | "failed" | "interrupted";
    readonly reason?: string;
}
export interface WaitOptions {
    readonly timeoutMs: number;
    readonly mode: "all" | "any";
    readonly signal?: AbortSignal;
    /** Only count a session as finished once it went idle at or after this time. */
    readonly since?: number;
    readonly onProgress?: (pending: number) => void;
}
export interface WaitOutcome {
    readonly results: WaitResult[];
    readonly timedOut: boolean;
    readonly aborted: boolean;
}
export declare function waitForSessions(host: Host, sessionIDs: readonly string[], options: WaitOptions): Promise<WaitOutcome>;
