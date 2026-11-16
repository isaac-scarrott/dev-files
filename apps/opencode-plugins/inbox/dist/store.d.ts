import { type AskIdentity } from "./merge.js";
/** One `ask_isaac` ask, as the file holds it. */
export interface AskRecord {
    /** The number the tool and the panel show: `#7`. */
    readonly id: number;
    /** The merge key; see `merge.ts`. */
    readonly key: string;
    readonly scope: AskIdentity["scope"];
    readonly ref?: string;
    /** The root session of the asker's family. */
    readonly root: string;
    /** The session the answer is delivered to. */
    readonly session: string;
    readonly question: string;
    readonly options?: readonly string[];
    readonly blocking: boolean;
    readonly createdAt: number;
    readonly lastAskedAt: number;
    /** How often it was asked; 1 the first time, and no ask is added while it waits. */
    readonly asks: number;
    readonly answeredAt?: number;
    readonly answer?: string;
    readonly dismissedAt?: number;
}
export interface InboxFile {
    version: 1;
    nextID: number;
    asks: AskRecord[];
}
export declare const emptyFile: () => InboxFile;
export declare const isPending: (record: AskRecord) => boolean;
export declare const pendingAsks: (file: InboxFile) => AskRecord[];
export type MergeOutcome = {
    readonly type: "new";
    readonly record: AskRecord;
} | {
    readonly type: "pending";
    readonly record: AskRecord;
} | {
    readonly type: "answered";
    readonly record: AskRecord;
};
export interface MergeInput {
    readonly question: string;
    readonly options?: readonly string[];
    readonly ref?: string;
    readonly blocking: boolean;
    readonly session: string;
    readonly root: string;
    readonly now: number;
    /** An answered ask older than this is forgotten, so the same question can be asked again. */
    readonly rememberMs: number;
}
/**
 * Adds an ask, or counts it when the same ask waits or was answered recently: a pending item gains a re-ask and nothing
 * else, and an answered one keeps its answer so the tool can hand it straight back. Mutates `file` in place (it is the
 * caller's read-modify-write copy) and drops settled asks past `rememberMs`.
 */
export declare function mergeAsk(file: InboxFile, input: MergeInput): MergeOutcome;
/** Marks a pending ask answered; the answer is what the tool returns for a re-ask within `rememberMs`. */
export declare function answerAsk(file: InboxFile, id: number, answer: string, now: number): AskRecord | undefined;
/** Marks a pending ask dismissed: nothing waits for it any more, and the model is told so. */
export declare function dismissAsk(file: InboxFile, id: number, now: number): AskRecord | undefined;
/** Reads whatever a file holds, keeping only well-formed records; a broken file starts empty rather than failing a tool call. */
export declare function parseFile(raw: unknown): InboxFile;
