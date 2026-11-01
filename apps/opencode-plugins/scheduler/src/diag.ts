import { appendFile, mkdir, rename, stat } from "node:fs/promises"
import path from "node:path"

const MAX_LOG_BYTES = 1_000_000

/**
 * The plugin API has no logger and the service's stderr is not kept anywhere a user can read, so every line goes both to
 * stderr and to `scheduler.log`. The file is rotated once at startup when it passes 1 MB. Prompts are never logged.
 */
export function createLog(dir: string, now: () => number): (message: string) => void {
  const file = path.join(dir, "scheduler.log")
  let ready: Promise<void> = (async () => {
    await mkdir(dir, { recursive: true })
    const size = await stat(file).then((s) => s.size).catch(() => 0)
    if (size > MAX_LOG_BYTES) await rename(file, `${file}.1`)
  })().catch(() => {})
  return (message) => {
    const line = `${new Date(now()).toISOString()} ${message}`
    console.error(`[scheduler] ${message}`)
    ready = ready.then(() => appendFile(file, line + "\n")).catch(() => {})
  }
}
