import { execFile } from "node:child_process"

/** One row of `ps`: the identity and cost of a process at the moment of the snapshot. */
export interface Proc {
  readonly pid: number
  readonly ppid: number
  readonly pgid: number
  readonly uid: number
  /** Start time, epoch seconds (`lstart` has one-second resolution). Used against pid reuse. */
  readonly start: number
  /** Cumulative CPU seconds (`time=`). A scan takes its delta, never the absolute value. */
  readonly cpu: number
  /**
   * `stat` starts with Z: the process has exited and only its parent has yet to reap it. A zombie does no work and holds
   * nothing alive, so it is never a group member, never an escapee and never a leftover; the host's own `shell.exited`
   * says the same thing a few milliseconds earlier.
   */
  readonly zombie: boolean
  readonly command: string
}

export interface Snapshot {
  /** When `ps` was read, epoch milliseconds. */
  readonly at: number
  readonly procs: readonly Proc[]
  readonly byPid: ReadonlyMap<number, Proc>
  readonly byPgid: ReadonlyMap<number, readonly Proc[]>
}

export type Ps = () => Promise<Snapshot>

/**
 * One `ps` call for everything this plugin decides. `-ww` keeps long command lines whole, and every field is a
 * single token except `lstart` (five) and `command` (the rest), so a line parses left to right.
 */
export const PS_ARGS = ["-axww", "-o", "pid=,ppid=,pgid=,uid=,stat=,lstart=,time=,command="] as const

const LINE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s?(.*)$/

/** `[[dd-]hh:]mm:ss[.cc]` as ps prints it, in seconds. */
export function cpuSeconds(text: string): number | undefined {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text)
  if (!match) return undefined
  return Number(match[1] ?? 0) * 86_400 + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4])
}

export function parsePs(text: string, at: number): Snapshot {
  const procs: Proc[] = []
  const byPid = new Map<number, Proc>()
  const groups = new Map<number, Proc[]>()
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue
    const match = LINE.exec(line)
    // A command line with a newline in it spills over; the continuation matches nothing and is skipped.
    if (!match) continue
    const start = Math.round(Date.parse(match[6]!) / 1000)
    const cpu = cpuSeconds(match[7]!)
    if (!Number.isFinite(start) || cpu === undefined) continue
    const proc: Proc = {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      uid: Number(match[4]),
      zombie: match[5]!.startsWith("Z"),
      start,
      cpu,
      command: match[8] ?? "",
    }
    procs.push(proc)
    byPid.set(proc.pid, proc)
    groups.set(proc.pgid, [...(groups.get(proc.pgid) ?? []), proc])
  }
  return { at, procs, byPid, byPgid: groups }
}

/** The real thing: one `ps` per call, injectable so every rule can be tested without spawning anything. */
export function readPs(uid: number = process.getuid?.() ?? -1): Ps {
  return () =>
    new Promise<Snapshot>((resolve, reject) => {
      const at = Date.now()
      execFile("/bin/ps", [...PS_ARGS], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error)
        else resolve(parsePs(stdout, at))
      })
    })
}

/** The live (non-zombie) processes of one group, and of the escapees that left it, as this snapshot sees them. */
export function liveProcs(snapshot: Snapshot, pgid: number, startedAt: number, uid: number, escapees: readonly number[] = []): Proc[] {
  const floor = Math.floor(startedAt / 1000) - 1
  const found = (snapshot.byPgid.get(pgid) ?? []).filter((proc) => proc.uid === uid && proc.start >= floor && !proc.zombie)
  for (const pid of escapees) {
    const proc = snapshot.byPid.get(pid)
    if (proc && proc.uid === uid && proc.start >= floor && !proc.zombie && !found.includes(proc)) found.push(proc)
  }
  return found
}
