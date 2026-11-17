import type { Group } from "./ledger.js";
import type { LogEntry } from "./log.js";
import { type Proc, type Ps, type Snapshot } from "./ps.js";
import { type Notice } from "./report.js";
import type { ReapDecision } from "./rules.js";
export type Signal = "SIGTERM" | "SIGKILL";
export interface ReapDeps {
    readonly ps: Ps;
    /** `process.kill`; a negative pid signals a whole group. Injectable so tests kill nothing real. */
    readonly kill: (pid: number, signal: Signal) => void;
    readonly sleep: (ms: number) => Promise<void>;
    readonly log: (entry: LogEntry) => void;
    readonly uid: number;
    readonly servicePid: number;
    readonly selfPid: number;
    readonly graceMs: number;
    /** The monitor plugin's own groups, if it is loaded. */
    readonly monitorGroups: () => ReadonlySet<number> | undefined;
}
export interface ReapOutcome {
    /** `reaped`: something was signalled; `gone`: nothing of it was left; `skipped`: it may not be touched. */
    readonly state: "reaped" | "gone" | "skipped";
    readonly signaled: readonly number[];
    readonly survivors: readonly number[];
    readonly reason?: string;
}
/**
 * Re-reads the process table immediately before signalling and keeps only what still belongs to the group: our uid, a
 * start time at or after the group's, and for a member the group's own pgid. 1, the service, this process and a
 * monitor's group are never in the list.
 */
export declare function verified(group: Group, snapshot: Snapshot, deps: Pick<ReapDeps, "uid" | "servicePid" | "selfPid">): Proc[];
/**
 * SIGTERM to the group and to each escapee, `killGraceSeconds` to go, then SIGKILL whatever is left. The group is
 * signalled as a group so children that forked after the first snapshot go too; each escapee is signalled by pid.
 */
export declare function reap(group: Group, deps: ReapDeps): Promise<ReapOutcome>;
export interface ApplyDeps {
    readonly dryRun: boolean;
    readonly now: () => number;
    readonly log: (entry: LogEntry) => void;
    readonly reap: ReapDeps;
    readonly ledger: {
        reported(pgid: number, rule: string): boolean;
        markReported(pgid: number, rule: string): void;
        drop(pgid: number, reason: string): Promise<void>;
    };
    readonly reporter: {
        queue(sessionID: string, text: string, notice: Notice): void;
        notice(decision: ReapDecision, pids: readonly number[], dryRun: boolean, now: number): Notice;
    };
}
/**
 * One decision, dry or real. In `dryRun` nothing is signalled and the decision is only logged, once, since the group
 * stays and the same rule would otherwise fire at every scan. A dry run tells no session: on 2026-11-17 an agent read
 * "would end … limactl" as leave to kill its own preview VM, so what a dry run would do is for the owner's log alone.
 */
export declare function apply(decision: ReapDecision, procs: readonly Proc[], report: boolean, deps: ApplyDeps): Promise<void>;
