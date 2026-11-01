/**
 * Turns output chunks into lines. A chunk can end mid-line (or mid-character), so the unfinished tail waits for the
 * next chunk. A tail longer than `maxLineChars` is cut off and emitted with a marker so one endless line cannot grow
 * memory.
 */
export declare class LineSplitter {
    private readonly maxLineChars;
    private readonly decoder;
    private tail;
    private cut;
    constructor(maxLineChars: number);
    push(chunk: Buffer | string): string[];
    /** Output that ended without a trailing newline. */
    flush(): string[];
    private finish;
}
