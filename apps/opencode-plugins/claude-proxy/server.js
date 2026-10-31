import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// The Claude Agent provider spawns `claude --setting-sources=`, so ~/.claude/settings.json is never read.
// The spawned CLI inherits this process's env, so copy the proxy settings in here.
const KEYS = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]

export default {
  id: "claude-proxy",
  setup() {
    const file = path.join(homedir(), ".claude", "settings.json")
    const env = JSON.parse(readFileSync(file, "utf8")).env ?? {}
    for (const key of KEYS) if (env[key]) process.env[key] = env[key]
  },
}
