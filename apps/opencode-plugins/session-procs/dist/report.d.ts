import type { View } from "./ledger.js";
import type { LogEntry } from "./log.js";
import type { Proc } from "./ps.js";
import type { ReapDecision } from "./rules.js";
export interface Notice {
    readonly title: string;
    readonly body: string;
    readonly key: string;
    readonly session?: string;
}
export interface ReporterDeps {
    readonly now: () => number;
    readonly log: (entry: LogEntry) => void;
    /** The alerts hub, through this plugin's RPC event (the shell-handoff pattern). */
    readonly notify: (notice: Notice) => void;
    /** `ctx.session.synthetic` with `delivery: "steer"`, `resume: false`: the notice waits for the next turn. */
    readonly deliver: (sessionID: string, text: string) => Promise<void>;
}
export declare function duration(ms: number): string;
/** Commands and paths come from anywhere and are data: one line and bounded. */
export declare function oneLine(text: string, max?: number): string;
/**
 * The notice a reap leaves behind: what ended, how many, and which. With `dryRun` it says what it would have ended and
 * that nothing was killed, which is what Isaac reviews for the first three days.
 */
export declare function reapNotice(decision: ReapDecision, procs: readonly Proc[], pids: readonly number[], dryRun: boolean): string;
/** The runaway notice: one per group per over-threshold stretch, delivered without waking the session. */
export declare function runawayNotice(view: View, runawayCpu: number, runawayMinutes: number, now: number): {
    text: string;
    notice: Notice;
};
/**
 * Notices go straight into the session's inbox (`steer`, `resume: false`: nothing starts a turn) and, when the alerts
 * hub is installed, to one info notification. A delivery that fails is kept and retried at the next scan; a session
 * that is gone drops its notices.
 */
export declare class Reporter {
    private readonly deps;
    private readonly pending;
    constructor(deps: ReporterDeps);
    queue(sessionID: string, text: string, notice: Notice): void;
    /** Tries every queued notice once. Failures stay for the next scan, up to a bounded number of tries. */
    flush(sessionID?: string): Promise<void>;
    forget(sessionID: string): void;
    get size(): number;
    /** The hub notification for a reap. */
    notice(decision: ReapDecision, pids: readonly number[], dryRun: boolean, now: number): Notice;
}
