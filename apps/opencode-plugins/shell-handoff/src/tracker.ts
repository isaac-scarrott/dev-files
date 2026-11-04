import type { Options } from "./options.js"
import { redact } from "./redact.js"
import { type Job, type PendingNotice, JOB_PREFIX, NOTICE_PREFIX, jobKey, noticeKey, parseJob, parseNotice } from "./record.js"
import { type Lost, mergeFile, noticeText } from "./report.js"

export interface Store {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  scan(prefix: string): Promise<{ key: string; value: unknown }[]>
}

export interface Files {
  /** Absolute path of the handoff file for a session. */
  path(sessionID: string): string
  read(sessionID: string): Promise<string | undefined>
  write(sessionID: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** Deletes handoff files not touched since `before`. */
  prune(before: number): Promise<void>
}

export interface Host {
  sessionExists(sessionID: string): Promise<boolean>
  /** A queued notice that does not start a turn. */
  synthetic(sessionID: string, text: string): Promise<void>
}

export interface Notice {
  title: string
  body: string
  session?: string
  key: string
}

/** What `shell.created` says about a job: the host's own view, including what its restart record lacks (cwd, pid, file). */
export interface Created {
  id: string
  command: string
  cwd?: string
  file?: string
  sessionID?: string
  started?: number
}

export interface ToolEnd {
  tool: string
  sessionID: string
  messageID?: string
  callID?: string
  input: unknown
  status: "completed" | "error"
  result?: unknown
}

export interface Deps {
  options: Options
  boot: string
  /** This instance's location: it records and reports only what belongs to it. */
  location: string
  now: () => number
  /** When this service process started: the earlier one died just before, so this is when its jobs were lost. */
  restartedAt: () => number
  store: Store
  files: Files
  host: Host
  notify: (notice: Notice) => void
  /** One-shot timer that must not keep the process alive; returns its cancel. */
  later: (run: () => void, ms: number) => () => void
  log: (message: string) => void
}

interface Seen {
  info: Created
  exited: boolean
}

/** How long a killed job's record waits: a service shutdown kills the jobs and must still find them recorded. */
const KILL_GRACE_MS = 5000
const SEEN_CAP = 300
const SHELL_TOOL = "shell"

const asRecord = (value: unknown): Record<string, unknown> | undefined => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined)

export class Tracker {
  /** This boot's background jobs, as stored. */
  readonly jobs = new Map<string, Job>()
  private readonly seen = new Map<string, Seen>()
  private readonly pending = new Map<string, PendingNotice>()
  private readonly cancels = new Set<() => void>()

  constructor(private readonly deps: Deps) {}

  dispose(): void {
    for (const cancel of this.cancels) cancel()
    this.cancels.clear()
  }

  /** `shell.created`: remembered in memory only; a foreground command costs no write. */
  created(info: Created): void {
    this.seen.set(info.id, { info, exited: false })
    const job = this.jobs.get(info.id)
    // The event can arrive after the tool call returned: the record then learns what only the host knew.
    if (job) void this.enrich(job, info)
    while (this.seen.size > SEEN_CAP) {
      const oldest = this.seen.keys().next().value
      if (oldest === undefined) break
      this.seen.delete(oldest)
    }
  }

  private async enrich(job: Job, info: Created): Promise<void> {
    const next: Job = { ...job, cwd: info.cwd ?? job.cwd, output: info.file ?? job.output, startedAt: info.started ?? job.startedAt }
    if (next.cwd === job.cwd && next.output === job.output && next.startedAt === job.startedAt) return
    this.jobs.set(job.shellID, next)
    await this.deps.store.set(jobKey(job.shellID), next).catch((error) => this.deps.log(`could not update ${job.shellID}: ${String(error)}`))
  }

  /** `shell.exited` / `shell.deleted`. A killed job may be the service going down, so its record is kept a moment. */
  ended(id: string, status?: string): void {
    const seen = this.seen.get(id)
    if (seen) seen.exited = true
    if (!this.jobs.has(id)) return
    if (status !== "killed") return void this.drop(id)
    const cancel = this.deps.later(() => {
      this.cancels.delete(cancel)
      this.drop(id)
    }, KILL_GRACE_MS)
    this.cancels.add(cancel)
  }

  /** `execute.after` for the shell tool: a job still running when the call returned is a background job. */
  async toolEnd(event: ToolEnd): Promise<void> {
    if (event.tool !== SHELL_TOOL || event.status !== "completed") return
    const shellID = shellIDOf(event.result)
    if (!shellID) return
    const seen = this.seen.get(shellID)
    if (seen?.exited) return
    const input = asRecord(event.input)
    const command = seen?.info.command ?? (typeof input?.command === "string" ? input.command : undefined)
    if (!command) return
    const cwd = seen?.info.cwd ?? (typeof input?.workdir === "string" ? input.workdir : undefined)
    const timeout = typeof input?.timeout === "number" ? input.timeout : undefined
    const job: Job = {
      shellID,
      sessionID: event.sessionID,
      command: redact(command),
      cwd,
      output: seen?.info.file,
      startedAt: seen?.info.started ?? this.deps.now(),
      timeout,
      callID: event.callID,
      messageID: event.messageID,
      boot: this.deps.boot,
      location: this.deps.location,
    }
    this.jobs.set(shellID, job)
    await this.deps.store.set(jobKey(shellID), job).catch((error) => this.deps.log(`could not record ${shellID}: ${String(error)}`))
    await this.trim()
  }

  /** The session went idle: its recorded jobs that the host no longer lists have finished. */
  idle(sessionID: string, running: ReadonlySet<string>): void {
    for (const job of [...this.jobs.values()]) if (job.sessionID === sessionID && !running.has(job.shellID)) this.drop(job.shellID)
  }

  /** A deleted or archived session has nobody to tell. */
  removeSession(sessionID: string): void {
    for (const job of [...this.jobs.values()]) if (job.sessionID === sessionID) this.drop(job.shellID)
    this.pending.delete(sessionID)
    void this.deps.store.remove(noticeKey(sessionID)).catch(() => {})
  }

  /** At every boot of the plugin. A job from another service process is lost; one from this process survived a hot reload. */
  async restore(): Promise<void> {
    const { store, options, now, boot } = this.deps
    const cutoff = now() - options.retentionDays * 86_400_000
    const lost = new Map<string, Job[]>()
    for (const entry of await store.scan(JOB_PREFIX).catch(() => [])) {
      const job = parseJob(entry.value)
      if (!job || jobKey(job.shellID) !== entry.key || job.startedAt < cutoff) {
        await store.remove(entry.key).catch(() => {})
        continue
      }
      if (job.location !== this.deps.location) continue
      if (job.boot === boot) {
        this.jobs.set(job.shellID, job)
        continue
      }
      lost.set(job.sessionID, [...(lost.get(job.sessionID) ?? []), job])
    }
    for (const entry of await store.scan(NOTICE_PREFIX).catch(() => [])) {
      const notice = parseNotice(entry.value)
      if (!notice || notice.at < cutoff || noticeKey(entry.key.slice(NOTICE_PREFIX.length)) !== entry.key) await store.remove(entry.key).catch(() => {})
      else if (notice.location === this.deps.location) this.pending.set(entry.key.slice(NOTICE_PREFIX.length), notice)
    }
    await this.trim()
    if (options.file) await this.deps.files.prune(cutoff).catch((error) => this.deps.log(`could not prune handoff files: ${String(error)}`))
    for (const [sessionID, jobs] of lost) await this.report(sessionID, jobs.sort((a, b) => a.startedAt - b.startedAt))
    if (lost.size > 0) this.announce(lost)
    await this.flush()
  }

  /** Tries every queued notice; one that cannot be delivered stays for the next try. */
  async flush(sessionID?: string): Promise<void> {
    for (const id of sessionID ? (this.pending.has(sessionID) ? [sessionID] : []) : [...this.pending.keys()]) await this.deliver(id)
  }

  hasPending(sessionID: string): boolean {
    return this.pending.has(sessionID)
  }

  private async report(sessionID: string, jobs: Job[]): Promise<void> {
    const { files, options, now, store } = this.deps
    const at = Math.min(now(), this.deps.restartedAt())
    const found: Lost[] = await Promise.all(
      jobs.map(async (job) => ({
        ...job,
        outputExists: job.output ? await files.exists(job.output).catch(() => false) : false,
      })),
    )
    let path: string | undefined
    if (options.file) {
      try {
        await files.write(sessionID, mergeFile(await files.read(sessionID).catch(() => undefined), found, at, sessionID))
        path = files.path(sessionID)
      } catch (error) {
        this.deps.log(`${sessionID}: could not write the handoff file: ${String(error)}`)
      }
    }
    if (options.notice) {
      const notice: PendingNotice = { text: noticeText(found, at, path), at, location: this.deps.location }
      this.pending.set(sessionID, notice)
      await store.set(noticeKey(sessionID), notice).catch((error) => this.deps.log(`${sessionID}: could not queue the notice: ${String(error)}`))
    }
    for (const job of jobs) await store.remove(jobKey(job.shellID)).catch(() => {})
    this.deps.log(`${sessionID}: ${jobs.length} background job(s) lost to a restart`)
  }

  private announce(lost: ReadonlyMap<string, Job[]>): void {
    const count = [...lost.values()].reduce((sum, jobs) => sum + jobs.length, 0)
    const only = lost.size === 1 ? [...lost.keys()][0] : undefined
    this.deps.notify({
      title: count === 1 ? "A background shell job was lost to a restart" : `${count} background shell jobs were lost to a restart`,
      body: lost.size === 1 ? "Nothing was re-run. The session has the details." : `In ${lost.size} sessions. Nothing was re-run.`,
      session: only,
      key: `lost:${this.deps.boot}`,
    })
  }

  private async deliver(sessionID: string): Promise<void> {
    const notice = this.pending.get(sessionID)
    if (!notice) return
    const { host, store } = this.deps
    try {
      if (await host.sessionExists(sessionID)) await host.synthetic(sessionID, notice.text)
    } catch (error) {
      this.deps.log(`${sessionID}: notice not delivered yet: ${String(error)}`)
      return
    }
    this.pending.delete(sessionID)
    await store.remove(noticeKey(sessionID)).catch(() => {})
  }

  private drop(id: string): void {
    if (!this.jobs.delete(id)) return
    void this.deps.store.remove(jobKey(id)).catch((error) => this.deps.log(`could not remove ${id}: ${String(error)}`))
  }

  /** Over the cap, the oldest records go. */
  private async trim(): Promise<void> {
    const extra = this.jobs.size - this.deps.options.maxRecords
    if (extra <= 0) return
    const oldest = [...this.jobs.values()].sort((a, b) => a.startedAt - b.startedAt).slice(0, extra)
    for (const job of oldest) {
      this.jobs.delete(job.shellID)
      await this.deps.store.remove(jobKey(job.shellID)).catch(() => {})
    }
  }
}

/** A tool call that returned with the job still running carries its id in the result metadata. */
export function shellIDOf(result: unknown): string | undefined {
  const r = asRecord(result)
  const metadata = asRecord(r?.metadata)
  if (metadata?.status === "running" && typeof metadata.shellID === "string") return metadata.shellID
  return undefined
}
