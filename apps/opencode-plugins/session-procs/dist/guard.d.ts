import type { LogEntry } from "./log.js";
import type { Snapshot } from "./ps.js";
/**
 * The kill guard. `pkill`, `killall` and `pgrep … | xargs kill` choose their victims by pattern, and a pattern written
 * for one session's work matches the user's terminals, other sessions' jobs and the host itself. The guard refuses the
 * call when `pgrep -f` finds a process this session does not own, and says to signal by pid instead. Unparseable calls
 * pass: a guard that guessed would block real work.
 */
export type KillKind = "pkill" | "killall" | "xargs";
export interface KillCandidate {
    readonly kind: KillKind;
    readonly pattern: string;
}
interface Word {
    readonly text: string;
    /** The word holds `$…` or a backtick: not a pattern this guard can name. */
    readonly dynamic: boolean;
}
/** The command line as simple commands of plain words, quotes resolved; a substitution stays one (dynamic) word. */
export declare function segments(command: string): Word[][];
/** `pkill` / `killall` segments, and `pgrep … | xargs kill` pairs. Anything else, or anything dynamic, yields nothing. */
export declare function killCandidates(command: string): KillCandidate[];
/** `pgrep -f <pattern>`, the same pattern a pkill would expand. Its own misses and errors yield no pids. */
export declare function pgrep(pattern: string): Promise<number[]>;
export interface GuardDeps {
    readonly pgrep: (pattern: string) => Promise<number[]>;
    readonly snapshot: () => Promise<Snapshot | undefined>;
    /** The pids this session owns, from the ledger, in that snapshot. */
    readonly tracked: (sessionID: string, snapshot: Snapshot) => ReadonlySet<number>;
    readonly log: (entry: LogEntry) => void;
}
export interface ToolCall {
    readonly tool: string;
    readonly sessionID: string;
    readonly input: unknown;
}
/**
 * The `execute.before` hook. Refuses a kill by pattern that would reach a process the calling session does not own.
 * Runs in `dryRun` too: refusing is safe, and the pattern is dangerous whether or not this plugin would kill.
 */
export declare function createKillGuard(deps: GuardDeps): (event: ToolCall) => Promise<void>;
export {};
