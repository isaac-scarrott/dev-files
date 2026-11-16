import type { Snapshot } from "./ps.js";
/** What the host published in `shell.created`, as far as matching cares. */
export interface ShellCreated {
    readonly shellID: string;
    readonly sessionID?: string;
    readonly command: string;
    readonly cwd?: string;
    /** The shell the host resolved (`/bin/bash`). */
    readonly shell?: string;
    /** `info.time.started`, epoch milliseconds. */
    readonly started: number;
    /** `info.pid`: the leader of the shell's process group, present in 2.3.0. */
    readonly pid?: number;
}
export interface Service {
    readonly pid: number;
    readonly uid: number;
}
export interface Matched {
    readonly pgid: number;
    readonly leaderPid: number;
    /** Epoch seconds, as `ps` reports it: the guard against a reused pid. */
    readonly leaderStart: number;
}
export type MatchResult = {
    readonly state: "matched";
    readonly match: Matched;
} | {
    readonly state: "none";
    readonly reason: string;
} | {
    readonly state: "ambiguous";
    readonly pids: readonly number[];
};
/** `lstart` has one-second resolution and the event crosses a couple of milliseconds. */
export declare const START_SLACK_MS = 2000;
/** The pty daemon the host spawns tool shells under: `<cache>/opencode-pty daemon --runtime-dir …`. */
export declare function isPtyDaemon(command: string): boolean;
/**
 * `shell.created` → the process group it runs in. One candidate only: the leader (pid == pgid) of a group the service
 * spawned (directly or through its pty daemon), with the same argv and a start time within two seconds. No candidate, or
 * more than one (identical commands started together), means the group is not tracked: a wrong pgid would kill
 * someone else's work, and an untracked `&` server costs a leftover, not a wrong kill.
 */
export declare function matchShell(created: ShellCreated, snapshot: Snapshot, service: Service, exclude?: ReadonlySet<number>): MatchResult;
