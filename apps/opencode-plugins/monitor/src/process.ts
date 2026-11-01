import { spawn as nodeSpawn } from "node:child_process"

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
}

export interface ChildEvents {
  data(chunk: Buffer): void
  /** Called once, after the process ended and its output was read (or gave up waiting for it). */
  exit(code: number | null, signal: string | null): void
}

export interface Child {
  /** Signals the whole process group, so grandchildren die too. */
  kill(signal: "SIGTERM" | "SIGKILL"): void
  readonly pid?: number
}

export type Spawn = (spec: { command: string; cwd: string }, events: ChildEvents) => Child

// After the shell exits, a grandchild may still hold the pipes open; do not wait on it forever.
const DRAIN_MS = 300

/** Runs `command` in the user's shell as the leader of its own process group, stdout and stderr merged. */
export const spawnShell: Spawn = ({ command, cwd }, events) => {
  const shell = process.env.SHELL || "/bin/sh"
  const child = nodeSpawn(shell, ["-c", command], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"], env: process.env })
  let done = false
  const finish = (code: number | null, signal: string | null) => {
    if (done) return
    done = true
    events.exit(code, signal)
  }
  child.stdout.on("data", (chunk: Buffer) => events.data(chunk))
  child.stderr.on("data", (chunk: Buffer) => events.data(chunk))
  child.on("error", (error) => {
    events.data(Buffer.from(`failed to start: ${error.message}\n`))
    finish(127, null)
  })
  child.on("exit", (code, signal) => {
    const timer = setTimeout(() => finish(code, signal), DRAIN_MS)
    child.on("close", () => {
      clearTimeout(timer)
      finish(code, signal)
    })
  })
  return {
    pid: child.pid,
    kill(signal) {
      const pid = child.pid
      if (pid === undefined) return
      try {
        process.kill(-pid, signal)
      } catch {
        try {
          child.kill(signal)
        } catch {
          // already gone
        }
      }
    },
  }
}
