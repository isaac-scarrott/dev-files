export interface Options {
    /** Most schedules held at once, across all sessions. */
    readonly maxSchedules: number;
    /** Shortest allowed gap between runs of a recurring task, in seconds. */
    readonly minIntervalSeconds: number;
    /** A task that fires more than this many times within `loopWindowMinutes` is paused. */
    readonly loopMaxFires: number;
    readonly loopWindowMinutes: number;
    /** How often due tasks are looked at. Also the longest a sleeping machine waits to catch up after waking. */
    readonly tickSeconds: number;
    /** A run later than this is reported to the session as late. */
    readonly lateSeconds: number;
    /** Which sessions a task may target by title or ref: the caller's tree, its project, or every session. */
    readonly scope: "tree" | "project" | "all";
    /** Log file location. */
    readonly logDir: string;
}
export declare function defaultLogDir(): string;
export declare const DEFAULTS: Options;
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
