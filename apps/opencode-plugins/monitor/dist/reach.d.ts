/**
 * Which sessions a monitor may wake: the caller, its parent, and its own tree. This is the `tree` scope of
 * orchestrator-tools' `send_message` (scope.ts `reachable` plus the parent that `list_peers` shows), copied because
 * plugins are separate packages; keep the two in step.
 */
export interface SessionLike {
    readonly id: string;
    readonly parentID?: string;
    readonly metadata?: Record<string, unknown>;
}
export interface SessionReader {
    get(input: {
        sessionID: string;
    }): Promise<SessionLike>;
}
export declare function mayWake(sessions: SessionReader, caller: SessionLike, target: SessionLike): Promise<boolean>;
