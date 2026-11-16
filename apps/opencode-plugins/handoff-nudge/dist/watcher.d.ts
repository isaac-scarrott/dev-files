import type { Plugin } from "@opencode/plugin";
import { type Tokens, type Watch } from "./measure.js";
import { type Options } from "./options.js";
/** The slice of the plugin context the nudger uses; tests supply a fake. */
export type Host = Pick<Plugin.Context, "session" | "storage">;
export interface Clock {
    now(): number;
}
/** What the user should hear: one info notification per tier, through the `notifications` hub. */
export interface Outgoing {
    readonly title: string;
    readonly body: string;
    readonly key: string;
    readonly sessionID: string;
}
/**
 * Watches one location's sessions. Every instance reads and writes per-session records, so a record written through
 * whichever instance answered the GUI is the one the owning instance acts on at the next step.
 */
export declare class Watcher {
    private readonly host;
    private readonly options;
    private readonly clock;
    /** The project location this instance serves; it warns only for sessions that live there. */
    private readonly directory;
    private readonly log;
    /** Called with a session id when what the GUI shows for it may have changed. */
    changed: (sessionID: string) => void;
    /** Called with a notification to publish. */
    tell: (notification: Outgoing) => void;
    constructor(host: Host, options: Options, clock: Clock, 
    /** The project location this instance serves; it warns only for sessions that live there. */
    directory: string, log?: (message: string) => void);
    read(sessionID: string): Promise<Watch | undefined>;
    /** Whether this instance should watch the session at all: a root session, here, on a model the options name. */
    watches(sessionID: string): Promise<boolean>;
    onStep(sessionID: string, tokens: Tokens): Promise<void>;
    /** A run ended: the next step starts a new turn, which is the only one that can show a cold wake. */
    onTurnEnd(sessionID: string): Promise<void>;
    forget(sessionID: string): Promise<void>;
    /** "Hand off now": queue the same instruction as a user prompt, and hide the pill until the next tier. */
    handoff(sessionID: string): Promise<boolean>;
    /** "Not now": keep the pill quiet until a higher tier fires. */
    dismiss(sessionID: string): Promise<boolean>;
    private warn;
    private save;
}
