import type { View } from "./ledger.js"
import type { LogEntry } from "./log.js"
import type { Proc } from "./ps.js"
import type { ReapDecision, Rule } from "./rules.js"

export interface Notice {
  readonly title: string
  readonly body: string
  readonly key: string
  readonly session?: string
}

export interface ReporterDeps {
  readonly now: () => number
  readonly log: (entry: LogEntry) => void
  /** The alerts hub, through this plugin's RPC event (the shell-handoff pattern). */
  readonly notify: (notice: Notice) => void
  /** `ctx.session.synthetic` with `delivery: "steer"`, `resume: false`: the notice waits for the next turn. */
  readonly deliver: (sessionID: string, text: string) => Promise<void>
}

const LISTED = 5
const CMD = 70
const PENDING_CAP = 5
/** A notice whose delivery keeps failing is dropped after this many scans: its session is likely gone. */
const DELIVERY_ATTEMPTS = 20

export function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** Commands and paths come from anywhere and are data: one line and bounded. */
export function oneLine(text: string, max = CMD): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function listing(procs: readonly Proc[], pids: readonly number[]): string {
  const byPid = new Map(procs.map((proc) => [proc.pid, proc]))
  const shown = pids.slice(0, LISTED).map((pid) => {
    const command = byPid.get(pid)?.command
    return command ? `${pid} (${oneLine(command)})` : `${pid}`
  })
  const more = pids.length > LISTED ? [`+${pids.length - LISTED} more`] : []
  return [...shown, ...more].join(", ")
}

const noun = (rule: Rule, count: number): string => {
  const one = count === 1
  if (rule === "session-end") return one ? "process of this session" : "processes of this session"
  if (rule === "orphan") return one ? "orphaned process" : "orphaned processes"
  return one ? "leftover process" : "leftover processes"
}

const title = (rule: Rule): string =>
  rule === "session-end" ? "processes ended at the end of the session" : rule === "orphan" ? "orphaned processes ended" : "leftover processes ended"

/**
 * The notice a reap leaves behind: what ended, how many, and which. With `dryRun` it says what it would have ended and
 * that nothing was killed, which is what Isaac reviews for the first three days.
 */
export function reapNotice(decision: ReapDecision, procs: readonly Proc[], pids: readonly number[], dryRun: boolean): string {
  const count = `${pids.length} ${noun(decision.rule, pids.length)}`
  const verb = dryRun ? `Dry run: would end ${count}` : `Ended ${count}`
  const tail = dryRun ? " Nothing was killed." : ""
  return `${verb} (${decision.reason}): ${listing(procs, pids)}.${tail}`
}

/** The runaway notice: one per group per over-threshold stretch, delivered without waking the session. */
export function runawayNotice(view: View, runawayCpu: number, runawayMinutes: number, now: number): { text: string; notice: Notice } {
  const busiest = [...view.members, ...view.escapees].sort((a, b) => b.cpu - a.cpu)[0]
  const pid = busiest?.pid ?? view.group.leaderPid
  const command = busiest?.command ?? view.group.shellID
  const cpu = Math.round(view.cpu)
  const text = `Tracked process ${pid} (${oneLine(command)}) is using ${cpu}% CPU in ${oneLine(view.group.cwd ?? "its working directory", 160)} (over ${runawayCpu}% for ${duration(runawayMinutes * 60_000)}). It will be ended when this session ends (archived or deleted).`
  return {
    text,
    notice: { title: `A tracked process is using ${cpu}% CPU`, body: oneLine(command, 120), key: `runaway:${view.group.pgid}:${Math.floor(now / 60_000)}`, session: view.group.sessionID },
  }
}

/**
 * Notices go straight into the session's inbox (`steer`, `resume: false`: nothing starts a turn) and, when the alerts
 * hub is installed, to one info notification. A delivery that fails is kept and retried at the next scan; a session
 * that is gone drops its notices.
 */
export class Reporter {
  private readonly pending = new Map<string, { text: string; attempts: number }[]>()

  constructor(private readonly deps: ReporterDeps) {}

  queue(sessionID: string, text: string, notice: Notice): void {
    const queue = this.pending.get(sessionID) ?? []
    if (!queue.some((entry) => entry.text === text)) queue.push({ text, attempts: 0 })
    this.pending.set(sessionID, queue.slice(-PENDING_CAP))
    this.deps.notify(notice)
    this.deps.log({ event: "notice", sessionID, text })
  }

  /** Tries every queued notice once. Failures stay for the next scan, up to a bounded number of tries. */
  async flush(sessionID?: string): Promise<void> {
    for (const id of sessionID === undefined ? [...this.pending.keys()] : this.pending.has(sessionID) ? [sessionID] : []) {
      const queue = this.pending.get(id)
      if (!queue) continue
      while (queue.length > 0) {
        const entry = queue[0]!
        try {
          await this.deps.deliver(id, entry.text)
          queue.shift()
        } catch (error) {
          entry.attempts += 1
          this.deps.log({ event: "notice-failed", sessionID: id, attempts: entry.attempts, error: String(error) })
          if (entry.attempts >= DELIVERY_ATTEMPTS) {
            this.deps.log({ event: "notice-dropped", sessionID: id, text: entry.text })
            queue.shift()
            continue
          }
          break
        }
      }
      if (queue.length === 0) this.pending.delete(id)
    }
  }

  forget(sessionID: string): void {
    this.pending.delete(sessionID)
  }

  get size(): number {
    let total = 0
    for (const queue of this.pending.values()) total += queue.length
    return total
  }

  /** The hub notification for a reap. */
  notice(decision: ReapDecision, pids: readonly number[], dryRun: boolean, now: number): Notice {
    const body = dryRun ? `${pids.length} would be ended` : `${pids.length} ended`
    return {
      title: dryRun ? `Dry run: ${title(decision.rule)}` : title(decision.rule),
      body: `${body} (${decision.reason}); the session has the details.`,
      key: `reap:${decision.group.pgid}:${now}`,
      session: decision.group.sessionID,
    }
  }
}
