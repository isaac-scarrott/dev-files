export interface RankInput {
    readonly key: string;
    readonly createdAt: number;
    /** Minutes it has been waiting at the caller's `now`. */
    readonly ageMin: number;
    /** A permission, a built-in question, or an `ask_isaac` that blocks an idle session. */
    readonly blocked: boolean;
    /** Idle sessions of the asker's family other than the asker itself. */
    readonly waiters: number;
    readonly asks: number;
}
/**
 * `age × (blocked ? 1 : 0.25) × (1 + waiters) + reaskWeight × (asks − 1)`: a blocked ask costs every minute it waits; one
 * that does not still costs a quarter, because it comes back; and a question asked again is worth `reaskWeight` minutes.
 */
export declare function cost(item: RankInput, reaskWeight: number): number;
/** Highest cost first; equal costs by the older ask, then by key so the order never depends on map order. */
export declare function rank<T extends RankInput>(items: readonly T[], reaskWeight: number): (T & {
    readonly cost: number;
})[];
