import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// The Claude Agent provider spawns `claude --setting-sources=`, so ~/.claude/settings.json is never read.
// Provider settings are served by GET /api/model and /api/provider/*, so only the base URL goes there.
// The token never leaves this process except into the `claude` spawn env, through the model's connection env
// (see withToken). Nothing is written to process.env, where the shell tool and MCP servers would inherit it.
const PROVIDER = "claude-agent"
const PACKAGE = "@opencode/claude-agent"
const TOKEN_ENV = "ANTHROPIC_AUTH_TOKEN"
// Behind a base URL Claude Code looks like API-key mode and writes its cache on the 5-minute tier; a subscription login would
// get 1 hour by default. This env var asks for the 1-hour tier on the main conversation (subagents and compaction stay 5m).
const TTL_ENV = "CLAUDE_CODE_PROMPT_CACHE_TTL"
const HELPER_TIMEOUT_MS = 10_000
const CACHE_MS = 30_000

// A problem is logged once until it clears, so a broken helper does not fill the log. Messages carry names and
// exit codes only, never a value.
const active = new Set()
function warn(message) {
  if (active.has(message)) return
  active.add(message)
  console.warn(`claude-proxy: ${message}`)
}
function clear(prefix) {
  for (const message of active) if (message.startsWith(prefix)) active.delete(message)
}

function runHelper(command) {
  try {
    const stdout = execFileSync("/bin/sh", ["-c", command], {
      timeout: HELPER_TIMEOUT_MS,
      encoding: "utf8",
      maxBuffer: 1 << 16,
      stdio: ["ignore", "pipe", "ignore"],
    })
    return stdout.trim()
  } catch (error) {
    warn(error.code === "ETIMEDOUT" ? "apiKeyHelper timed out" : `apiKeyHelper failed (exit ${error.status ?? "none"})`)
    return undefined
  }
}

function readSettings(home) {
  const file = path.join(home, ".claude", "settings.json")
  try {
    const settings = JSON.parse(readFileSync(file, "utf8"))
    clear("cannot read")
    return settings
  } catch (error) {
    warn(`cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

export function readBaseURL(home = homedir()) {
  const value = readSettings(home)?.env?.ANTHROPIC_BASE_URL
  return typeof value === "string" && value ? value : undefined
}

// Resolves the token now: `env.ANTHROPIC_AUTH_TOKEN` in settings.json wins, otherwise the `apiKeyHelper` command
// prints it. Returns undefined when neither yields one.
export function resolveToken(home = homedir(), helper = runHelper) {
  const settings = readSettings(home)
  if (!settings) return undefined
  const literal = settings.env?.ANTHROPIC_AUTH_TOKEN
  if (typeof literal === "string" && literal) return literal
  if (typeof settings.apiKeyHelper !== "string" || !settings.apiKeyHelper) return undefined
  const value = helper(settings.apiKeyHelper)
  if (value === undefined) return undefined
  if (!value) {
    warn("apiKeyHelper printed nothing")
    return undefined
  }
  clear("apiKeyHelper")
  return value
}

// The token as of the last good read, refreshed at most once per `ttl`. A failed read keeps the last good value
// and is not retried before the next window, so a hung helper blocks at most once per window.
export function tokenSource({ home = homedir(), helper = runHelper, now = Date.now, ttl = CACHE_MS } = {}) {
  let value
  let readAt
  return {
    get() {
      const time = now()
      if (readAt === undefined || time - readAt >= ttl) {
        readAt = time
        value = resolveToken(home, helper) ?? value
      }
      return value
    },
  }
}

// Only the base URL: it is not a secret, and the status probe needs it.
export function apply(editor, baseURL) {
  if (!baseURL) return
  editor.update(PROVIDER, (provider) => {
    provider.settings = { ...provider.settings, baseURL }
  })
}

// The Claude Agent provider's own `sdk` hook runs first (it is built in, so it precedes plugins) and builds the
// model with a connection env made from the public settings. That model and its connection are cached for the life
// of the provider settings, so the token is a getter on the connection: it is read when each `claude` is spawned.
export const cacheTtlOption = (value) => (value === "5m" ? "5m" : "1h")

export function withToken(source, cacheTtl = "1h") {
  return (evt) => {
    if (evt.package !== PACKAGE) return
    const make = evt.sdk?.languageModel
    if (typeof make !== "function") return warn("claude-agent sdk has no languageModel; token not applied")
    evt.sdk.languageModel = (id) => {
      const model = make(id)
      const connection = model?.connection
      if (!connection || typeof connection !== "object" || Object.isFrozen(connection)) {
        warn("claude-agent model has no writable connection env; token not applied")
        return model
      }
      // Without a token the spawn keeps whatever the server env has, as if the plugin were absent.
      const get = () => source.get() ?? process.env[TOKEN_ENV]
      Object.defineProperty(connection, TOKEN_ENV, { enumerable: true, configurable: true, get })
      if (cacheTtl === "1h") Object.defineProperty(connection, TTL_ENV, { enumerable: true, configurable: true, value: "1h" })
      return model
    }
  }
}

export default {
  id: "claude-proxy",
  async setup(ctx) {
    const baseURL = readBaseURL()
    await ctx.provider.transform((editor) => apply(editor, baseURL))
    await ctx.aisdk.hook("sdk", withToken(tokenSource(), cacheTtlOption(ctx.options?.cacheTtl)), { providerID: PROVIDER })
  },
}
