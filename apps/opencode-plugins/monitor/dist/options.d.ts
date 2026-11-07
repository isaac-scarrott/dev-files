export interface Options {
    /** Running monitors at once, across all sessions: a safety cap for the shared service. */
    readonly maxMonitors: number;
    /** Running monitors at once for one session. */
    readonly maxPerSession: number;
    /** Auto-stop after this long unless the tool is given another ttlMinutes. */
    readonly ttlMinutes: number;
    readonly maxEventsPerHour: number;
    readonly minRearmMinutes: number;
    readonly maxLinesPerWake: number;
    readonly maxLineChars: number;
    /** Bytes of unsent output held per monitor; lines past it are dropped and counted. */
    readonly maxBufferBytes: number;
    readonly killGraceSeconds: number;
    readonly logDir: string;
}
export declare const DEFAULTS: Options;
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
