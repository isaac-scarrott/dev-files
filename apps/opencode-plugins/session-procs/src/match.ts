import type { Proc, Snapshot } from "./ps.js"

/** What the host published in `shell.created`, as far as matching cares. */
export interface ShellCreated {
  readonly shellID: string
  readonly sessionID?: string
  readonly command: string
  readonly cwd?: string
  /** The shell the host resolved (`/bin/bash`). */
  readonly shell?: string
  /** `info.time.started`, epoch milliseconds. */
  readonly started: number
  /** `info.pid`: the leader of the shell's process group, present in 2.3.0. */
  readonly pid?: number
}

export interface Service {
  readonly pid: number
  readonly uid: number
}

export interface Matched {
  readonly pgid: number
  readonly leaderPid: number
  /** Epoch seconds, as `ps` reports it: the guard against a reused pid. */
  readonly leaderStart: number
}

export type MatchResult =
  | { readonly state: "matched"; readonly match: Matched }
  | { readonly state: "none"; readonly reason: string }
  | { readonly state: "ambiguous"; readonly pids: readonly number[] }

/** `lstart` has one-second resolution and the event crosses a couple of milliseconds. */
export const START_SLACK_MS = 2000

/** The pty daemon the host spawns tool shells under: `<cache>/opencode-pty daemon --runtime-dir …`. */
export function isPtyDaemon(command: string): boolean {
  return /(^|\/)opencode-pty daemon(\s|$)/.test(command)
}

function childOfService(proc: Proc, snapshot: Snapshot, servicePid: number): boolean {
  if (proc.ppid === servicePid) return true
  const parent = snapshot.byPid.get(proc.ppid)
  return parent !== undefined && parent.ppid === servicePid && isPtyDaemon(parent.command)
}

/**
 * The shell's own command line. 2.3.0's shell tool publishes the pid, and the shell usually *is* the last command
 * (`bash -c 'sleep 30'` execs sleep: ps shows `sleep 30`), and a nested `sh -c '…'` loses its quotes when bash re-parses
 * it before the exec (`ps` shows `sh -c sleep 300 & echo ok`). The pid, the parent and the start time carry the identity;
 * the text only has to agree with one of the two shapes once quotes and spacing are normalised.
 */
function normalize(text: string): string {
  return text.replace(/['"]/g, "").replace(/\s+/g, " ").trim()
}

/**
 * A shell that has already exited shows as a zombie before its parent reaps it: ps prints `<defunct>` or `(bash)` and the
 * argv is gone. With the host's own pid, that is still the shell (a leftover's group is worth tracking); without a pid
 * there is nothing to identify it by.
 */
const UNREADABLE = /^(?:<defunct>|\([A-Za-z0-9._-]+\))$/

function sameArgv(proc: Proc, created: ShellCreated): boolean {
  if (UNREADABLE.test(proc.command.trim())) return created.pid !== undefined
  const command = normalize(created.command)
  if (normalize(proc.command) === command) return true
  if (created.shell !== undefined) return normalize(proc.command) === normalize(`${created.shell} -c ${created.command}`)
  return normalize(proc.command).endsWith(` -c ${command}`)
}

/**
 * `shell.created` → the process group it runs in. One candidate only: the leader (pid == pgid) of a group the service
 * spawned (directly or through its pty daemon), with the same argv and a start time within two seconds. No candidate, or
 * more than one (identical commands started together), means the group is not tracked: a wrong pgid would kill
 * someone else's work, and an untracked `&` server costs a leftover, not a wrong kill.
 */
export function matchShell(created: ShellCreated, snapshot: Snapshot, service: Service, exclude: ReadonlySet<number> = new Set()): MatchResult {
  const candidates = snapshot.procs.filter(
    (proc) =>
      proc.uid === service.uid &&
      proc.pgid === proc.pid &&
      !exclude.has(proc.pgid) &&
      (created.pid === undefined || proc.pid === created.pid) &&
      childOfService(proc, snapshot, service.pid) &&
      sameArgv(proc, created) &&
      Math.abs(proc.start * 1000 - created.started) <= START_SLACK_MS,
  )
  if (candidates.length === 0) {
    const near = snapshot.procs.filter((proc) => created.pid !== undefined && proc.pid === created.pid)
    return { state: "none", reason: near.length === 0 ? "the shell is already gone" : "pid, parent, argv and start time do not agree" }
  }
  if (candidates.length > 1) return { state: "ambiguous", pids: candidates.map((proc) => proc.pid) }
  const leader = candidates[0]!
  return { state: "matched", match: { pgid: leader.pgid, leaderPid: leader.pid, leaderStart: leader.start } }
}
