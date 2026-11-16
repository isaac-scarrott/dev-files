/** One row of `ps`: the identity and cost of a process at the moment of the snapshot. */
export interface Proc {
    readonly pid: number;
    readonly ppid: number;
    readonly pgid: number;
    readonly uid: number;
    /** Start time, epoch seconds (`lstart` has one-second resolution). Used against pid reuse. */
    readonly start: number;
    /** Cumulative CPU seconds (`time=`). A scan takes its delta, never the absolute value. */
    readonly cpu: number;
    /**
     * `stat` starts with Z: the process has exited and only its parent has yet to reap it. A zombie does no work and holds
     * nothing alive, so it is never a group member, never an escapee and never a leftover; the host's own `shell.exited`
     * says the same thing a few milliseconds earlier.
     */
    readonly zombie: boolean;
    readonly command: string;
}
export interface Snapshot {
    /** When `ps` was read, epoch milliseconds. */
    readonly at: number;
    readonly procs: readonly Proc[];
    readonly byPid: ReadonlyMap<number, Proc>;
    readonly byPgid: ReadonlyMap<number, readonly Proc[]>;
}
export type Ps = () => Promise<Snapshot>;
/**
 * One `ps` call for everything this plugin decides. `-ww` keeps long command lines whole, and every field is a
 * single token except `lstart` (five) and `command` (the rest), so a line parses left to right.
 */
export declare const PS_ARGS: readonly ["-axww", "-o", "pid=,ppid=,pgid=,uid=,stat=,lstart=,time=,command="];
/** `[[dd-]hh:]mm:ss[.cc]` as ps prints it, in seconds. */
export declare function cpuSeconds(text: string): number | undefined;
export declare function parsePs(text: string, at: number): Snapshot;
/** The real thing: one `ps` per call, injectable so every rule can be tested without spawning anything. */
export declare function readPs(uid?: number): Ps;
/** The live (non-zombie) processes of one group, and of the escapees that left it, as this snapshot sees them. */
export declare function liveProcs(snapshot: Snapshot, pgid: number, startedAt: number, uid: number, escapees?: readonly number[]): Proc[];
