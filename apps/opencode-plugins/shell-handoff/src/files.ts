import { chmod, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Files } from "./tracker.js"

/** A session id is a path segment: anything outside this alphabet never reaches the file system. */
const SAFE = /^[A-Za-z0-9_-]{1,128}$/

/** The handoff files: private to the user (0600 in a 0700 directory), replaced whole through a rename. */
export function diskFiles(dir: string): Files {
  const path = (sessionID: string) => {
    if (!SAFE.test(sessionID)) throw new Error("unsafe session id")
    return join(dir, `${sessionID}.md`)
  }
  return {
    path,
    read: (sessionID) => readFile(path(sessionID), "utf8").catch(() => undefined),
    async write(sessionID, text) {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await chmod(dir, 0o700)
      const target = path(sessionID)
      const temp = `${target}.${process.pid}.tmp`
      await writeFile(temp, text, { mode: 0o600 })
      await chmod(temp, 0o600)
      await rename(temp, target)
    },
    exists: (file) => stat(file).then(() => true, () => false),
    async prune(before) {
      for (const name of await readdir(dir).catch(() => [] as string[])) {
        if (!name.endsWith(".md")) continue
        const file = join(dir, name)
        const info = await stat(file).catch(() => undefined)
        if (info && info.mtimeMs < before) await unlink(file).catch(() => {})
      }
    },
  }
}
