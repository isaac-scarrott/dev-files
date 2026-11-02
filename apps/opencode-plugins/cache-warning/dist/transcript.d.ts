import type { Learned } from "./predict.js";
export type { Learned };
/** Most of the file that is ever read, from the end. */
export declare const TAIL_BYTES: number;
export declare const projectsRoot: () => string;
/** The folder Claude Code names for a working directory: every `/` and `.` becomes `-`. */
export declare const encodeCwd: (cwd: string) => string;
/**
 * The tier of the newest request in `text` that wrote cache (1h if it wrote to the 1 hour tier, else 5m), read from
 * numbers only. A request served wholly from cache writes nothing and names no tier, so it is passed over: the last
 * known tier carries forward. When the text starts mid-file, `partial` drops the first, cut-off line.
 */
export declare function newestWrite(text: string, partial: boolean): Learned | undefined;
/** Where the transcript of a native session lives, if it does. Never returns a path outside `root`. */
export declare function findTranscript(root: string, nativeID: string, cwd?: string): Promise<string | undefined>;
/** Reads transcripts' tails and remembers the answer for as long as the file is unchanged. */
export declare class Transcripts {
    private readonly root;
    private readonly seen;
    constructor(root?: string);
    /** The tier the session's newest cache write used; undefined when it cannot be told. Never throws. */
    learn(nativeID: string, cwd?: string): Promise<Learned | undefined>;
}
