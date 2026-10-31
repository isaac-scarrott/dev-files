import { readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { disabledNames, setEnabled } from "./config"

const file = path.join(homedir(), ".config", "opencode", "opencode.json")

async function read(): Promise<Record<string, unknown> & { plugins?: unknown[] }> {
  return JSON.parse(await readFile(file, "utf8"))
}

export const config = {
  async disabled() {
    return disabledNames((await read()).plugins ?? [])
  },
  async set(input: { name: string; enabled: boolean }) {
    const current = await read()
    current.plugins = setEnabled(current.plugins ?? [], input.name, input.enabled)
    const next = `${file}.tmp`
    await writeFile(next, `${JSON.stringify(current, null, 2)}\n`)
    await rename(next, file)
  },
}
