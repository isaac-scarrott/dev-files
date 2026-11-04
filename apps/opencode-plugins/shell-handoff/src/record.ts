import { redact } from "./redact.js"

/** A background shell job as stored: the command is redacted before it gets here and nothing here is ever executed. */
export interface Job {
  shellID: string
  sessionID: string
  command: string
  cwd?: string
  pid?: number
  /** The host's output file for the job. */
  output?: string
  startedAt: number
  timeout?: number
  callID?: string
  messageID?: string
  /** The service process that started it (see boot.ts). */
  boot: string
}

export const JOB_PREFIX = "job/"
export const NOTICE_PREFIX = "notice/"

export const jobKey = (shellID: string) => `${JOB_PREFIX}${shellID}`
export const noticeKey = (sessionID: string) => `${NOTICE_PREFIX}${sessionID}`

const str = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined)
const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/** Anything stored that does not have the shape is ignored, and removed by the caller. */
export function parseJob(value: unknown): Job | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const o = value as Record<string, unknown>
  const shellID = str(o.shellID)
  const sessionID = str(o.sessionID)
  const command = str(o.command)
  const startedAt = num(o.startedAt)
  const boot = str(o.boot)
  if (!shellID || !sessionID || !command || startedAt === undefined || !boot) return undefined
  return {
    shellID,
    sessionID,
    // Defence in depth: whatever was stored is redacted again before it is shown.
    command: redact(command),
    cwd: str(o.cwd),
    pid: num(o.pid),
    output: str(o.output),
    startedAt,
    timeout: num(o.timeout),
    callID: str(o.callID),
    messageID: str(o.messageID),
    boot,
  }
}

export interface PendingNotice {
  text: string
  at: number
}

export function parseNotice(value: unknown): PendingNotice | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const o = value as Record<string, unknown>
  const text = str(o.text)
  const at = num(o.at)
  return text && at !== undefined ? { text, at } : undefined
}
