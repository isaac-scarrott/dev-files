import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// The Claude Agent provider spawns `claude --setting-sources=`, so ~/.claude/settings.json is never read.
// Its spawn env is the server env plus the provider's own settings (baseURL, authToken), so the proxy
// settings go in the provider's settings and never in process.env, where the shell tool and MCP servers
// would inherit the token.
const PROVIDER = "claude-agent"
const HELPER_TIMEOUT_MS = 10_000

const warned = new Set()

// Messages carry names and exit codes only, never a value.
function warn(message) {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(`claude-proxy: ${message}`)
}

function runHelper(command) {
  return new Promise((resolve) => {
    execFile("/bin/sh", ["-c", command], { timeout: HELPER_TIMEOUT_MS, encoding: "utf8", maxBuffer: 1 << 16 }, (error, stdout) => {
      if (error) {
        warn(error.killed ? "apiKeyHelper timed out" : `apiKeyHelper failed (exit ${error.code})`)
        return resolve("")
      }
      const value = stdout.trim()
      if (!value) warn("apiKeyHelper printed nothing")
      resolve(value)
    })
  })
}

// ANTHROPIC_AUTH_TOKEN in settings.json env wins; otherwise the apiKeyHelper command prints it.
// Fails soft: anything missing or broken yields fewer settings and a warning.
export async function read(home = homedir(), helper = runHelper) {
  const file = path.join(home, ".claude", "settings.json")
  let settings
  try {
    settings = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    warn(`cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
  const env = settings.env ?? {}
  const result = {}
  if (typeof env.ANTHROPIC_BASE_URL === "string" && env.ANTHROPIC_BASE_URL) result.baseURL = env.ANTHROPIC_BASE_URL
  if (typeof env.ANTHROPIC_AUTH_TOKEN === "string" && env.ANTHROPIC_AUTH_TOKEN) result.authToken = env.ANTHROPIC_AUTH_TOKEN
  else if (typeof settings.apiKeyHelper === "string" && settings.apiKeyHelper) {
    const token = await helper(settings.apiKeyHelper)
    if (token) result.authToken = token
  }
  return result
}

export function apply(editor, settings) {
  if (Object.keys(settings).length === 0) return
  editor.update(PROVIDER, (provider) => {
    provider.settings = { ...provider.settings, ...settings }
  })
}

export default {
  id: "claude-proxy",
  async setup(ctx) {
    const settings = await read()
    await ctx.provider.transform((editor) => apply(editor, settings))
  },
}
