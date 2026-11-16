export interface Options {
    /** Model ids the plugin watches; `*` is a wildcard and matching is case-insensitive. */
    readonly models: readonly string[];
    /** Context sizes, in tokens, that each warn once per crossing. Ascending. */
    readonly tiers: readonly number[];
    /** A cold wake whose first step writes this many cache tokens is worth a warning. */
    readonly coldWrite: number;
}
export declare const DEFAULTS: Options;
export declare function modelMatches(id: string | undefined, models: readonly string[]): boolean;
/** The options as written in `opencode.json`; tokens are counts and `models` are globs. */
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
