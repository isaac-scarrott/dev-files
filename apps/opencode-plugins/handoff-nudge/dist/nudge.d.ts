/** `412000` → `412k`; sizes are only ever used to tell the agent and the user how big the next request is. */
export declare function formatTokens(tokens: number): string;
export interface Sizes {
    /** The context the next request re-sends. */
    readonly context: number;
    /** What the last cold wake wrote to the cache, when one was measured. */
    readonly coldWrite?: number;
}
/** The warning posted to the agent when the context reaches a tier. */
export declare function tierNotice(sizes: Sizes): string;
/** The warning posted to the agent when a cold wake rewrote a large part of the context. */
export declare function coldNotice(sizes: Sizes): string;
/** What "Hand off now" queues as a user prompt: the same instruction, without the injected-message wrapper. */
export declare function handoffPrompt(sizes: Sizes): string;
