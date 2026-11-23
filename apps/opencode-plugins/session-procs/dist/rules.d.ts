import type { Group, View } from "./ledger.js";
import type { Options } from "./options.js";
/** What the rules need to know about a session. `undefined` from the fetch means "could not ask", not "gone". */
export interface SessionFacts {
    readonly exists: boolean;
    readonly archived: boolean;
    /** A sub-agent's session has a parent. */
    readonly parentID?: string;
    /** The host's own view: `time.busy` after `time.idle`. */
    readonly busy: boolean;
    /** End of the last completed execution, epoch milliseconds. */
    readonly idleAt?: number;
    /** The session's own directory: the plugin instance there is the one that can answer for it. */
    readonly location?: string;
}
export type Rule = "session-end" | "subagent-idle" | "orphan";
export interface ReapDecision {
    readonly group: Group;
    readonly rule: Rule;
    /** Every live process the decision covers: group members and escapees. */
    readonly pids: readonly number[];
    readonly reason: string;
}
/** The runaway clock of one group: when it crossed the line, and whether that stretch was already reported. */
export interface RunawayState {
    readonly since?: number;
    readonly notified: boolean;
}
/**
 * One over-threshold stretch is one notice: crossing reports once, dropping resets, crossing again reports again.
 * `runawayMinutes` only delays the report, never the clock the orphan rule reuses.
 */
export declare function evaluateRunaway(state: RunawayState, cpu: number, runawayCpu: number, runawayMinutes: number, now: number): {
    state: RunawayState;
    report: boolean;
};
export interface DecideInput {
    readonly views: readonly View[];
    readonly sessions: ReadonlyMap<string, SessionFacts | undefined>;
    /** Sessions with a running monitor; `undefined` when the monitor plugin is not loaded. */
    readonly monitors: ReadonlySet<string> | undefined;
    readonly now: number;
    readonly options: Pick<Options, "subagentIdleMinutes" | "runawayCpu" | "orphanKillMinutes">;
    readonly runawaySince: (pgid: number) => number | undefined;
}
/**
 * The reap table, as decisions and nothing else:
 *
 * | session archived or deleted       | every group of that session, live background jobs included |
 * | sub-agent idle, no monitor, not busy | leftovers only: groups whose shell exited                |
 * | orphan over the CPU line, same    | that group                                                |
 *
 * A top-level session is never idle-reaped: its long-lived work (a VM, a server) is deliberate. A group whose shell is
 * still alive is a live background job and is never idle-reaped. A decision is taken once per group, so the sub-agent
 * idle and orphan rows cannot both speak for it. A session whose facts could not be read is left alone.
 */
export declare function decide(input: DecideInput): ReapDecision[];
