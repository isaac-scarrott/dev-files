import type { Plugin } from "@opencode/plugin";
export type Storage = Pick<Plugin.Context["storage"], "get" | "set">;
interface DefaultValue {
    enabled: boolean;
    /** When the default was last turned on, epoch ms. A session without its own entry follows the default only if it was created after. */
    since: number;
}
/**
 * Auto-resume is opt-in. A session resumes only when its own toggle is on; the global default decides what a NEW session
 * starts with, and the session's own choice, once made, always wins. Subagents (sessions with a parent) are never on.
 */
export declare class Toggles {
    private readonly storage;
    private readonly now;
    constructor(storage: Storage, now: () => number);
    default(): Promise<DefaultValue>;
    setDefault(enabled: boolean): Promise<void>;
    /** The session's own choice, if it has made one or was created while the default was on. */
    own(sessionID: string): Promise<boolean | undefined>;
    set(sessionID: string, enabled: boolean): Promise<void>;
    /** A session was created: it starts with the default as it is now. Keeps an existing choice. */
    seed(sessionID: string): Promise<void>;
    /** Whether the session may be resumed. `created` is the session's creation time, for sessions seen before they were seeded. */
    effective(sessionID: string, root: boolean, created: number): Promise<{
        on: boolean;
        why: string;
    }>;
}
export {};
