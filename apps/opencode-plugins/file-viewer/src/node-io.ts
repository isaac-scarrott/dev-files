import { promises as fs } from "node:fs"
import type { FileIO, Stat } from "./resolve"

/** A `FileIO` over the local file system, for a server part or a test. */
export const nodeFileIO: FileIO = {
  async stat(absolute): Promise<Stat> {
    try {
      const real = await fs.realpath(absolute)
      const info = await fs.stat(real)

      if (info.isFile()) return { type: "file", real, size: info.size }

      return { type: info.isDirectory() ? "directory" : "other", real }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code

      if (code === "EACCES" || code === "EPERM") return { type: "denied" }

      return { type: "missing" }
    }
  },
}
