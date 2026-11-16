// What deserves an answer first, as minutes of someone else's cost: how long it has waited, whether anything is blocked,
// how many sessions sit behind the answer, and how often it has been asked.
/**
 * `age × (blocked ? 1 : 0.25) × (1 + waiters) + reaskWeight × (asks − 1)`: a blocked ask costs every minute it waits; one
 * that does not still costs a quarter, because it comes back; and a question asked again is worth `reaskWeight` minutes.
 */
export function cost(item, reaskWeight) {
    return Math.max(0, item.ageMin) * (item.blocked ? 1 : 0.25) * (1 + Math.max(0, item.waiters)) + reaskWeight * Math.max(0, item.asks - 1);
}
/** Highest cost first; equal costs by the older ask, then by key so the order never depends on map order. */
export function rank(items, reaskWeight) {
    return items
        .map((item) => ({ ...item, cost: cost(item, reaskWeight) }))
        .sort((a, b) => b.cost - a.cost || a.createdAt - b.createdAt || a.key.localeCompare(b.key));
}
//# sourceMappingURL=rank.js.map