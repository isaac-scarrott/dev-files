/** A background shell job as stored: the command is redacted before it gets here and nothing here is ever executed. */
export interface Job {
    shellID: string;
    sessionID: string;
    command: string;
    cwd?: string;
    pid?: number;
    /** The host's output file for the job. */
    output?: string;
    startedAt: number;
    timeout?: number;
    callID?: string;
    messageID?: string;
    /** The service process that started it (see boot.ts). */
    boot: string;
}
export declare const JOB_PREFIX = "job/";
export declare const NOTICE_PREFIX = "notice/";
export declare const jobKey: (shellID: string) => string;
export declare const noticeKey: (sessionID: string) => string;
/** Anything stored that does not have the shape is ignored, and removed by the caller. */
export declare function parseJob(value: unknown): Job | undefined;
export interface PendingNotice {
    text: string;
    at: number;
}
export declare function parseNotice(value: unknown): PendingNotice | undefined;
