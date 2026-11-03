export type FillField = {
    name: string;
    kind: string;
    selector?: string;
    label?: string;
};
type Handle = {
    sessionID: string;
    tabID: string;
    origin: string;
    fields: FillField[];
    values: string[];
    expires: number;
};
/** The text of the script that fills, with the values inside it. As secret as the values: it exists only in memory, between the hook and the page. */
export declare function fillScript(origin: string, fields: FillField[], values: string[]): string;
/**
 * Fill handles: `blindfold.fill` returns a placeholder script, and the `execute.before` hook of `browser.evaluate` swaps it
 * for the script that carries the values. Measured in the private harness: the tool runs with the swapped input while the
 * stored call keeps the placeholder, so no value reaches the model, agent code or the session database.
 *
 * The placeholder is claimed only when it is the whole script, as one string literal. Embedded in anything else (agent code
 * that would send the swapped text somewhere) it stays inert and the handle stays unclaimed.
 */
export declare function createFills(now?: () => number): {
    issue(handle: Omit<Handle, "expires">): string;
    /** The script to run instead of `script`, or undefined when it is not a live handle for this session and tab. */
    claim(script: string, context: {
        sessionID: string;
        tabID: unknown;
    }): string | undefined;
    clear: () => void;
    readonly size: number;
};
export {};
