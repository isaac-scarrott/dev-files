/** Parsing of the times a task can be given: a moment (`at`) and a repeat interval (`every`). */
/** `90m`, `2h`, `1h30m`, `1 day`, `+2h`. A bare number is minutes. Returns milliseconds. */
export declare function parseDuration(input: string | number): number;
/** An absolute ISO time (no zone means local time) or a relative `+2h`. Returns epoch milliseconds. */
export declare function parseAt(input: string, now: number): number;
/** `2h 5m`, for durations in messages. */
export declare function formatSpan(ms: number): string;
