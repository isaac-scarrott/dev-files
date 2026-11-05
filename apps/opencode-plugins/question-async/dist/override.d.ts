export interface JsonObjectSchema {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly [key: string]: unknown;
}
/** True only for the shape we know how to extend: a plain JSON Schema object with a `properties` map. Anything else
 * (a Zod instance, a different schema system, a future reshape) is left alone rather than guessed at. */
export declare function isJsonObjectSchema(input: unknown): input is JsonObjectSchema;
export declare const BLOCKING_PROPERTY = "blocking";
/** Adds `blocking` to a copy of the schema; never mutates the original. */
export declare function withBlocking(schema: JsonObjectSchema): JsonObjectSchema;
export declare function hasBlocking(schema: unknown): boolean;
export declare function appendBlockingNote(description: string): string;
/** Best-effort text out of whatever shape the native tool's result turns out to be. */
export declare function answerTextOf(result: unknown): string;
export declare function questionSummary(input: Record<string, unknown>): string;
export interface AsyncExecuteDeps<Input, Context, Result> {
    readonly original: (input: Input, context: Context) => Promise<Result>;
    readonly sessionIDOf: (context: Context) => string;
    readonly synthetic: (input: {
        sessionID: string;
        text: string;
        description: string;
    }) => Promise<unknown>;
    readonly log: (message: string) => void;
}
/** The new `execute`: `blocking: false` fires the native ask, returns at once, and delivers the eventual answer (or
 * dismissal) as a synthetic message. `blocking` default/true calls the native execute unchanged. */
export declare function createAsyncExecute<Context, Result>(deps: AsyncExecuteDeps<Record<string, unknown>, Context, Result>): (input: Record<string, unknown>, context: Context) => Promise<Result | {
    output: string;
}>;
