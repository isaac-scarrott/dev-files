export type Claim = {
    readonly won: true;
} | {
    readonly won: false; /** How long ago the winner claimed it, ms. */
    readonly ageMs: number;
};
/** Exactly-once gate: the first caller for a key wins, every later caller (any instance, any restart) loses. */
export interface Claims {
    claim(key: string): Promise<Claim>;
}
/** In-memory claims, for tests and as the process-wide first gate. Pass one map to several schedulers to simulate shared instances. */
export declare function memoryClaims(now: () => number, held?: Map<string, number>): Claims;
/**
 * Claims that survive restarts and span processes: the process-wide map first (a synchronous check-and-set), then an
 * `O_EXCL` file per key under `dir`, so only one creator wins even across processes. If the directory cannot be written
 * the process-wide claim still stands, which covers the instances that actually share a process.
 */
export declare function fileClaims(dir: string, now: () => number, log: (message: string) => void): Claims;
