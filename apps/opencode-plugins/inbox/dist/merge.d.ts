/** Lowercase, punctuation removed, whitespace collapsed: what the text key is computed from. */
export declare function normalise(text: string): string;
/** FNV-1a, 8 hex digits: a short, stable key for a normalised question, with no dependency. */
export declare function hash(text: string): string;
export interface AskIdentity {
    /** `ref:<ref>` or `text:<hash of the normalised question>`. */
    readonly key: string;
    /** `all`: a ref, whatever session asks; `root`: the question's text, only within the asker's root family. */
    readonly scope: "all" | "root";
    readonly ref?: string;
}
export declare function askIdentity(input: {
    readonly question: string;
    readonly ref?: string;
}): AskIdentity;
/** Whether a stored ask is the same ask as this identity asked from `root`. */
export declare function sameAsk(stored: {
    readonly key: string;
    readonly root: string;
}, identity: AskIdentity, root: string): boolean;
