/** The cache tier Claude Code's transcript showed for a session's newest cache write. */
export interface Learned {
    readonly ttl: "5m" | "1h";
    /** Epoch ms the request was logged. */
    readonly at: number;
}
/** A tier read longer ago than this before the step cannot be trusted to still apply (the 1 hour tier plus slack). */
export declare const LEARNED_WINDOW_MS: number;
/** The learned tier's lifetime when it comes from a write at or shortly before the step, else the configured one. */
export declare function ttlFor(config: Config, anchor: number, learned?: Learned): number;
/** A session message as far as the prediction reads it; the host's `SessionMessageInfo` satisfies it. */
export interface Msg {
    readonly id?: string;
    readonly type: string;
    readonly status?: string;
    readonly model?: {
        readonly id: string;
        readonly providerID: string;
        readonly variant?: string;
    };
    readonly tokens?: {
        readonly input: number;
        readonly output: number;
        readonly reasoning: number;
        readonly cache: {
            readonly read: number;
            readonly write: number;
        };
    };
    readonly time?: {
        readonly created?: unknown;
        readonly streamed?: unknown;
        readonly completed?: unknown;
    };
}
/** The model the next prompt is sent with, as the composer reports it. */
export interface Selection {
    readonly providerID: string;
    readonly modelID: string;
    readonly variant?: string;
}
export interface Config {
    /** How long the provider keeps a prompt cache entry after its last use. */
    readonly ttlMs: number;
    /** Contexts below this many tokens never warn. */
    readonly minTokens: number;
}
export type Notice = {
    readonly kind: "expired";
    readonly tokens: number;
} | {
    readonly kind: "model";
    readonly tokens: number;
};
/** The state the next message will meet, and when the warm cache runs out, if it is warm. */
export interface Forecast {
    readonly notice?: Notice;
    /** Epoch ms at which a warm cache expires; absent when nothing is waiting on the clock. */
    readonly expiresAt?: number;
}
/** Epoch milliseconds of a timestamp the host may hand over as a number, a Date or a string. */
export declare function millis(value: unknown): number | undefined;
/** The size the context ring shows: every token the last step read, wrote or produced. */
export declare function contextSize(tokens: NonNullable<Msg["tokens"]>): number;
/**
 * The cache is touched when a step's request starts, not when its reply ends, so the step's creation is the anchor;
 * the first streamed and the completed timestamps are the fallbacks for a message that lacks it.
 */
export declare function touched(message: Msg): number | undefined;
/**
 * The composer reports the model's default variant as undefined, a stored message as "default" (or empty): one choice.
 */
export declare function variantOf(variant: string | undefined): string;
/** A model id without a leading `provider/`, which some sources write and others leave out. */
export declare function bareId(id: string, providerID: string): string;
/**
 * What the next prompt will cost in cache terms, read from the tail of the conversation: the latest assistant step
 * with usage is the last measure (the host's context ring reads the same step) and the time anchor. A step without
 * usage that has ended (a failed one) made no cache call to count and is passed over; one still running means a
 * request is in flight and silences the warning. A prompt after the measured step also silences it, as does a reply
 * under way or a completed compaction (the measured size is gone and the new one is unknown).
 */
export declare function forecast(input: {
    messages: ReadonlyArray<Msg>;
    now: number;
    config: Config;
    selection?: Selection;
    /** The tier the session's transcript showed; the configured TTL applies without it. */
    learned?: Learned;
}): Forecast;
/** The latest assistant step with usage: the one the forecast reads, and so the point at which a learned tier is stale. */
export declare function measuredStep(messages: ReadonlyArray<Msg>): Msg | undefined;
/** The host's number style for token counts: compact, whole, lower case ("180k"). */
export declare function humanize(count: number, locale: string): string;
