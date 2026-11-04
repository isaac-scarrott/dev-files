import type { Job } from "./record.js";
/** What was learned about a job at the restart, beyond the record. */
export interface Lost extends Job {
    /** The host's output file for the job is still on disk. */
    outputExists?: boolean;
}
export declare const FILE_CAP_BYTES: number;
export declare function duration(ms: number): string;
/** One line, no control characters, bounded: recorded commands are data and may come from anywhere. */
export declare function oneLine(text: string, max: number): string;
/**
 * The file for one session: a header, then one section per restart, newest first. Sections that no longer fit the cap are
 * dropped from the end (the oldest); a single section over the cap is cut.
 */
export declare function mergeFile(existing: string | undefined, jobs: readonly Lost[], at: number, sessionID: string, cap?: number): string;
/** The queued notice for the model: a few lines, five jobs at most. */
export declare function noticeText(jobs: readonly Lost[], at: number, file: string | undefined): string;
