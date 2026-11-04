import type { Options } from "./options.js";
import { type Job } from "./record.js";
export interface Store {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
    scan(prefix: string): Promise<{
        key: string;
        value: unknown;
    }[]>;
}
export interface Files {
    /** Absolute path of the handoff file for a session. */
    path(sessionID: string): string;
    read(sessionID: string): Promise<string | undefined>;
    write(sessionID: string, text: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    /** Deletes handoff files not touched since `before`. */
    prune(before: number): Promise<void>;
}
export interface Host {
    sessionExists(sessionID: string): Promise<boolean>;
    /** A queued notice that does not start a turn. */
    synthetic(sessionID: string, text: string): Promise<void>;
    alive(pid: number): boolean;
}
export interface Notice {
    title: string;
    body: string;
    session?: string;
    key: string;
}
/** What `shell.created` says about a job: the host's own view, including what its restart record lacks (cwd, pid, file). */
export interface Created {
    id: string;
    command: string;
    cwd?: string;
    pid?: number;
    file?: string;
    sessionID?: string;
    started?: number;
}
export interface ToolEnd {
    tool: string;
    sessionID: string;
    messageID?: string;
    callID?: string;
    input: unknown;
    status: "completed" | "error";
    result?: unknown;
}
export interface Deps {
    options: Options;
    boot: string;
    /** This instance's location: it records and reports only what belongs to it. */
    location: string;
    now: () => number;
    /** When this service process started: the earlier one died just before, so this is when its jobs were lost. */
    restartedAt: () => number;
    store: Store;
    files: Files;
    host: Host;
    notify: (notice: Notice) => void;
    /** One-shot timer that must not keep the process alive; returns its cancel. */
    later: (run: () => void, ms: number) => () => void;
    log: (message: string) => void;
}
export declare class Tracker {
    private readonly deps;
    /** This boot's background jobs, as stored. */
    readonly jobs: Map<string, Job>;
    private readonly seen;
    private readonly pending;
    private readonly cancels;
    constructor(deps: Deps);
    dispose(): void;
    /** `shell.created`: remembered in memory only; a foreground command costs no write. */
    created(info: Created): void;
    private enrich;
    /** `shell.exited` / `shell.deleted`. A killed job may be the service going down, so its record is kept a moment. */
    ended(id: string, status?: string): void;
    /** `execute.after` for the shell tool: a job still running when the call returned is a background job. */
    toolEnd(event: ToolEnd): Promise<void>;
    /** The session went idle: its recorded jobs that the host no longer lists have finished. */
    idle(sessionID: string, running: ReadonlySet<string>): void;
    /** A deleted or archived session has nobody to tell. */
    removeSession(sessionID: string): void;
    /** At every boot of the plugin. A job from another service process is lost; one from this process survived a hot reload. */
    restore(): Promise<void>;
    /** Tries every queued notice; one that cannot be delivered stays for the next try. */
    flush(sessionID?: string): Promise<void>;
    hasPending(sessionID: string): boolean;
    private report;
    private announce;
    private deliver;
    private drop;
    /** Over the cap, the oldest records go. */
    private trim;
}
/** A tool call that returned with the job still running carries its id in the result metadata. */
export declare function shellIDOf(result: unknown): string | undefined;
