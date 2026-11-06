/** The part of a session error the detector reads. Matches `SessionError.Error` from the plugin SDK. */
export interface ErrorLike {
    readonly type?: string;
    readonly message?: string;
    readonly status?: number;
    readonly response?: {
        readonly body?: string;
    };
    readonly retryAfterMs?: number;
}
export interface UsageLimit {
    /** `five hour`, `seven day`, `overage`, … as the Claude Agent provider prints it; absent when the message names none. */
    readonly kind?: string;
    /** Epoch ms the error says usage returns, if it says. */
    readonly resetsAt?: number;
}
/**
 * Whether `error` is a Claude usage limit, and when it says usage returns. `at` is when the failure was recorded
 * (epoch ms), the base for `retryAfterMs`.
 */
export declare function detectUsageLimit(error: ErrorLike | undefined, at: number): UsageLimit | undefined;
/**
 * Whether the run was refused because every cliproxy account is cooling down for Claude. It is a usage wall the same way
 * a 5-hour limit is, but it names no reset time, so the resumer waits on the usage endpoint instead of a stated time.
 * Deliberately not part of `detectUsageLimit`: that one drives the retry hook, and a short 429 is better left to
 * OpenCode's own retry than ended early.
 */
export declare function detectProviderCooldown(error: ErrorLike | undefined): UsageLimit | undefined;
