export interface Options {
    /** Off: no adoption, no scanning, no guard. Also off while `~/.config/opencode/session-procs.off` exists. */
    readonly enabled: boolean;
    /** Log and report what would be killed, kill nothing. The kill guard still refuses: refusing is safe. */
    readonly dryRun: boolean;
    readonly scanSeconds: number;
    /** A sub-agent session idle this long, with no monitor, has the leftovers of its exited shells ended. Top-level sessions are never idle-reaped. */
    readonly subagentIdleMinutes: number;
    /** Percent of one CPU that counts as runaway: 90 is 90% of a core, measured across the group. */
    readonly runawayCpu: number;
    /** A tracked group over `runawayCpu` for this long gets one notice, once. */
    readonly runawayMinutes: number;
    /** An orphaned group over `runawayCpu` for this long is ended while its session is not busy. */
    readonly orphanKillMinutes: number;
    /** SIGTERM, then SIGKILL after this long. */
    readonly killGraceSeconds: number;
    /** Refuse pkill / killall / `pgrep … | xargs kill` when the pattern matches processes this session does not own. */
    readonly guardKill: boolean;
    /** Where log.jsonl goes. Not documented for users: tests and the harness set it. */
    readonly dir: string;
}
export declare const defaultDir: () => string;
export declare const OFF_FILE: string;
export declare const DEFAULTS: Options;
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
