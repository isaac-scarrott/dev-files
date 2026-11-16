import { type Service, type ShellCreated } from "./match.js";
import type { LogEntry } from "./log.js";
import type { Options } from "./options.js";
import { type Proc, type Ps, type Snapshot } from "./ps.js";
import type { RunawayState, SessionFacts } from "./rules.js";
export interface Store {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
    scan(prefix: string): Promise<{
        key: string;
        value: unknown;
    }[]>;
}
/** A process group a `shell.created` was matched to: the unit this plugin tracks, reaps and reports. */
export interface Group {
    readonly pgid: number;
    readonly leaderPid: number;
    /** The leader's `lstart`, epoch seconds: a reused pid has a different one. */
    readonly leaderStart: number;
    readonly sessionID: string;
    readonly shellID: string;
    /** The host's own mark that the job left the foreground (`execute.after` with a shellID). */
    background: boolean;
    /** `shell.created` time, epoch milliseconds. */
    readonly startedAt: number;
    /** The session's directory the shell ran in, for the notices. */
    readonly cwd?: string;
    /** The shell (leader) exited: what remains in the group is a leftover. */
    exitedAt?: number;
    /** Processes whose parent is tracked but whose group is not: they setsid'd or detached themselves. */
    escapees: number[];
}
/** What one group looks like in one snapshot, with the CPU its last window cost. */
export interface View {
    readonly group: Group;
    readonly members: readonly Proc[];
    readonly escapees: readonly Proc[];
    /** Percent of one CPU over the window since the previous scan. */
    readonly cpu: number;
    readonly leaderAlive: boolean;
    /** The shell exited and every remaining member was reparented to init. */
    readonly orphan: boolean;
}
export declare const LEDGER_PREFIX = "ledger/";
export declare const SEEN_CAP = 500;
export declare function parseGroup(value: unknown): Group | undefined;
export interface LedgerDeps {
    readonly store: Store;
    readonly ps: Ps;
    readonly now: () => number;
    readonly log: (entry: LogEntry) => void;
    readonly options: Options;
    readonly servicePid: number;
    readonly uid: number;
}
/**
 * The groups this service owns, keyed by pgid, with what is needed to decide about them. One instance per service
 * process: the plugin loads once per directory, every instance hears every event, and a per-location ledger would adopt
 * the same shell several times and reap it several times.
 */
export declare class Ledger {
    private active;
    readonly groups: Map<number, Group>;
    private readonly runtime;
    private readonly adopting;
    private readonly seen;
    private readonly backgroundShells;
    constructor(active: LedgerDeps);
    get deps(): LedgerDeps;
    /** A plugin reload builds the module again in the same process: the dependencies come from the newest instance. */
    rebind(deps: LedgerDeps): void;
    get service(): Service;
    private state;
    private save;
    /**
     * `shell.created`: take one snapshot, match the shell to its process group, record it. Called from every plugin
     * instance in the process, so the shellID is claimed once and a second claim is a no-op.
     */
    adopt(created: ShellCreated, monitors: ReadonlySet<number> | undefined): Promise<void>;
    /**
     * The host says the job left the foreground. `execute.after` is heard before `shell.created` (measured), so the mark
     * waits for the adoption; if it arrives after one, the record learns it.
     */
    markBackground(shellID: string): void;
    /** `shell.exited` / `shell.deleted`: the leader is gone; whatever is left in the group is a leftover. */
    exit(shellID: string, reason: string): void;
    /**
     * A restart left the groups in storage and their processes on the machine: adopt back the ones whose processes are
     * still there, with the same uid and a start time at or after the group's, and forget the rest. The leader may be
     * gone (a `&` server outliving its shell), so a single live member is enough.
     */
    restore(): Promise<number>;
    /**
     * One scan of the process table: escapees, exits, dropped groups, and each group's cost in the window since the last
     * scan. Returns what the rules decide from.
     */
    sync(snapshot: Snapshot): Promise<View[]>;
    /** The group is over: forget it, in memory and in storage. */
    drop(pgid: number, reason: string): Promise<void>;
    /** The runaway clock for one view: one report per continuous over-threshold stretch. */
    runaway(view: View): RunawayState;
    setRunaway(pgid: number, state: RunawayState): void;
    /** Whether this rule already reported this group (a `dryRun` group stays, so the scan must not repeat itself). */
    reported(pgid: number, rule: string): boolean;
    markReported(pgid: number, rule: string): void;
    /** The pids this session owns in this snapshot: group members and escapees, all matched to a `shell.created`. */
    trackedPids(sessionID: string, snapshot: Snapshot): Set<number>;
    /** The monitor's own groups, if the monitor plugin is loaded: never tracked, never signalled. */
    monitorGroups(monitors: readonly {
        pgid: number;
    }[] | undefined): Set<number>;
}
/**
 * What one plugin instance can ask the host. The service runs one instance per directory, `session.get` is answered by an
 * instance of the session's own location, and the scan loop is whichever instance acquired last: so every instance
 * offers its host calls and the scan asks the one whose directory matches, then the rest.
 */
export interface Peer {
    readonly location: string;
    readonly facts: (sessionID: string) => Promise<SessionFacts | undefined>;
    readonly deliver: (sessionID: string, text: string) => Promise<void>;
}
/** The one ledger of this service process, and how many plugin instances are still using it. */
export interface Shared {
    readonly ledger: Ledger;
    refs: number;
    timer: ReturnType<typeof setTimeout> | undefined;
    scanning: boolean;
    restored: boolean;
    /** Scans and event-driven reaps run one at a time, whichever instance's listener asks. */
    chain: Promise<void>;
    /** Event keys already handled: every instance hears every event and one of them must act. */
    readonly events: Map<string, number>;
    /** Session facts of the current scan, one `session.get` per session. */
    readonly sessions: Map<string, SessionFacts | undefined>;
    /** Every live instance's host calls, by instance. */
    readonly peers: Map<symbol, Peer>;
    /** The last logged on/off state, so a disabled plugin says so once rather than every scan. */
    quiet?: string;
    /** Which instance's scan loop is the live one: a superseded loop stops instead of re-arming beside the new one. */
    tick?: symbol;
}
export interface Acquired {
    readonly shared: Shared;
    release(): void;
}
export declare function acquire(deps: LedgerDeps, peer: Peer): Acquired;
/** Tests get a fresh process-like view: the singleton is removed. */
export declare function resetShared(): void;
