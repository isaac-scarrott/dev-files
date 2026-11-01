import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { apply, read } from "./server.js"

function home(settings) {
  const dir = mkdtempSync(path.join(tmpdir(), "claude-proxy-"))
  if (settings === undefined) return dir
  mkdirSync(path.join(dir, ".claude"))
  writeFileSync(path.join(dir, ".claude", "settings.json"), typeof settings === "string" ? settings : JSON.stringify(settings))
  return dir
}

const SECRET = "sk-secret-value-123"
const logged = []
console.warn = (message) => logged.push(String(message))
const never = () => assert.fail("helper must not run")

test("literal env token and base URL become provider settings", async () => {
  const dir = home({ env: { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: "t", OTHER: "no" } })
  assert.deepEqual(await read(dir, never), { baseURL: "http://x", authToken: "t" })
})

test("apiKeyHelper supplies the token when env has none", async () => {
  const dir = home({ env: { ANTHROPIC_BASE_URL: "http://x" }, apiKeyHelper: "/path/helper.sh" })
  const commands = []
  const settings = await read(dir, async (command) => (commands.push(command), SECRET))
  assert.deepEqual(settings, { baseURL: "http://x", authToken: SECRET })
  assert.deepEqual(commands, ["/path/helper.sh"])
})

test("env token wins over apiKeyHelper", async () => {
  const dir = home({ env: { ANTHROPIC_AUTH_TOKEN: "t" }, apiKeyHelper: "/path/helper.sh" })
  assert.deepEqual(await read(dir, never), { authToken: "t" })
})

test("empty helper output leaves the token out", async () => {
  const dir = home({ env: { ANTHROPIC_BASE_URL: "http://x" }, apiKeyHelper: "/path/helper.sh" })
  assert.deepEqual(await read(dir, async () => ""), { baseURL: "http://x" })
})

test("the real helper runner trims output, and a failing or empty helper warns by name without values", async () => {
  logged.length = 0
  const { default: plugin } = await import("./server.js")
  assert.equal(plugin.id, "claude-proxy")
  const run = async (command) => read(home({ apiKeyHelper: command }))
  assert.deepEqual(await run(`printf '  ${SECRET}\\n'`), { authToken: SECRET })
  assert.deepEqual(await run(`echo ${SECRET} >&2; exit 3`), {})
  assert.deepEqual(await run("true"), {})
  assert.deepEqual(logged, ["claude-proxy: apiKeyHelper failed (exit 3)", "claude-proxy: apiKeyHelper printed nothing"])
  assert.ok(!logged.some((line) => line.includes(SECRET)))
})

test("missing settings.json warns and does not throw", async () => {
  logged.length = 0
  assert.deepEqual(await read(home(), never), {})
  assert.equal(logged.length, 1)
})

test("invalid settings.json warns and does not throw", async () => {
  logged.length = 0
  assert.deepEqual(await read(home("{ nope"), never), {})
  assert.equal(logged.length, 1)
})

test("apply merges into the claude-agent provider settings only", () => {
  const calls = []
  const provider = { settings: { timeout: 5 } }
  apply({ update: (id, fn) => (calls.push(id), fn(provider)) }, { baseURL: "http://x", authToken: "t" })
  assert.deepEqual(calls, ["claude-agent"])
  assert.deepEqual(provider.settings, { timeout: 5, baseURL: "http://x", authToken: "t" })
})

test("apply does nothing without settings", () => {
  apply({ update: () => assert.fail("no update expected") }, {})
})

test("setup never writes process.env", async (t) => {
  t.after(() => (process.env.HOME = realHome))
  const realHome = process.env.HOME
  process.env.HOME = home({ env: { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: "t" } })
  const before = JSON.stringify(process.env)
  const { default: plugin } = await import("./server.js")
  const transforms = []
  await plugin.setup({ provider: { transform: async (fn) => transforms.push(fn) } })
  assert.equal(transforms.length, 1)
  assert.equal(JSON.stringify(process.env), before)
})
