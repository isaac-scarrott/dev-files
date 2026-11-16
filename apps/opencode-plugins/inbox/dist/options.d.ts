export interface Options {
    /** The least time between two inbox notifications. */
    readonly notifyEveryMin: number;
    /** Minutes at which a blocked ask raises another notification. */
    readonly escalateMin: readonly number[];
    /** How long an answered ask is remembered, so a re-ask returns its answer instead of asking again. */
    readonly rememberAnsweredH: number;
    /** The minutes a re-ask is worth in the ranking, per ask after the first. */
    readonly reaskWeight: number;
}
export declare const DEFAULTS: Options;
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
