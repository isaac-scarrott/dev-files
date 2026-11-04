export interface Options {
    /** Records and handoff files older than this are dropped. */
    retentionDays: number;
    /** Most records kept; the oldest go first. */
    maxRecords: number;
    /** Tell the session (a queued notice, no turn) about jobs lost to a restart. */
    notice: boolean;
    /** Write the handoff file. */
    file: boolean;
    /** Publish an info notification to the alerts hub. */
    notify: boolean;
    /** Where handoff files go. Not documented for users: tests and the harness set it. */
    dir: string;
}
export declare const defaultDir: () => string;
export declare function parseOptions(raw: unknown): Options;
