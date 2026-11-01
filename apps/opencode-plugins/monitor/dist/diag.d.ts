export declare function oneLine(text: string, limit?: number): string;
/**
 * The plugin API has no logger, so every line goes to stderr and to `monitor.log` in `dir`. Rotated once at startup
 * past 1 MB. Output lines of monitored commands are never logged, only lifecycle events.
 */
export declare function createLog(dir: string, now: () => number): (message: string) => void;
