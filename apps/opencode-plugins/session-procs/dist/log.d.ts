/** One JSON line in `log.jsonl`: what happened, to what, and when. */
export interface LogEntry {
    readonly event: string;
    readonly [field: string]: unknown;
}
/** A command line and a path are data from anywhere: flattened and cut before either reach a log line. */
export declare function logField(text: string): string;
/**
 * Every action goes to `log.jsonl` in the plugin's data directory and to stderr, in the monitor's style. The plugin API
 * has no logger, and this one is where Isaac reviews three days of `dryRun` before it kills anything.
 */
export declare function createLog(dir: string, now: () => number): (entry: LogEntry) => void;
