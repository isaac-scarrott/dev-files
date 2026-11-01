import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// The Claude Agent provider spawns `claude --setting-sources=`, so ~/.claude/settings.json is never read.
// The spawned CLI inherits this process's env, so copy the proxy settings in here.
const KEYS = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]

const applied = new Set()

// Fails soft: a missing or invalid settings file leaves the env alone and logs a warning.
export function sync(home = homedir(), target = process.env) {
  const file = path.join(home, ".claude", "settings.json")
  let env
  try {
    env = JSON.parse(readFileSync(file, "utf8")).env ?? {}
  } catch (error) {
    console.warn(`claude-proxy: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  for (const key of KEYS) {
    if (env[key]) {
      target[key] = env[key]
      applied.add(key)
    } else if (applied.delete(key)) delete target[key]
  }
}

export default {
  id: "claude-proxy",
  setup() {
    sync()
  },
}
