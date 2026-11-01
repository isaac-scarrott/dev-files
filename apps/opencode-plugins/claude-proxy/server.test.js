import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import plugin, { apply, readBaseURL, resolveToken, tokenSource, withToken } from "./server.js"

function home(settings) {
  const dir = mkdtempSync(path.join(tmpdir(), "claude-proxy-"))
  if (settings === undefined) return dir
  mkdirSync(path.join(dir, ".claude"))
  writeSettings(dir, settings)
  return dir
}

function writeSettings(dir, settings) {
  writeFileSync(path.join(dir, ".claude", "settings.json"), typeof settings === "string" ? settings : JSON.stringify(settings))
}

const SECRET = "sk-secret-value-123"
const logged = []
console.warn = (message) => logged.push(String(message))
const never = () => assert.fail("helper must not run")
const clock = (start = 0) => {
  const state = { time: start }
  return { now: () => state.time, advance: (ms) => (state.time += ms) }
}

test("base URL comes from env in settings.json", () => {
  assert.equal(readBaseURL(home({ env: { ANTHROPIC_BASE_URL: "http://x", OTHER: "no" } })), "http://x")
  assert.equal(readBaseURL(home({ env: {} })), undefined)
})

test("literal env token wins over apiKeyHelper", () => {
  assert.equal(resolveToken(home({ env: { ANTHROPIC_AUTH_TOKEN: "t" }, apiKeyHelper: "/h" }), never), "t")
})

test("apiKeyHelper supplies the token when env has none", () => {
  const commands = []
  const dir = home({ env: {}, apiKeyHelper: "/path/helper.sh" })
  assert.equal(resolveToken(dir, (command) => (commands.push(command), SECRET)), SECRET)
  assert.deepEqual(commands, ["/path/helper.sh"])
})

test("empty helper output leaves the token out and warns by name", () => {
  logged.length = 0
  assert.equal(resolveToken(home({ apiKeyHelper: "/h" }), () => ""), undefined)
  assert.deepEqual(logged, ["claude-proxy: apiKeyHelper printed nothing"])
})

test("the real helper runner trims output; a failing or silent helper warns by name without values", () => {
  logged.length = 0
  const run = (command) => resolveToken(home({ apiKeyHelper: command }))
  assert.equal(run(`printf '  ${SECRET}\\n'`), SECRET)
  assert.equal(run(`echo ${SECRET} >&2; exit 3`), undefined)
  assert.equal(run("true"), undefined)
  assert.deepEqual(logged, ["claude-proxy: apiKeyHelper failed (exit 3)", "claude-proxy: apiKeyHelper printed nothing"])
  assert.ok(!logged.some((line) => line.includes(SECRET)))
})

test("missing or invalid settings.json warns and does not throw", () => {
  logged.length = 0
  assert.equal(readBaseURL(home()), undefined)
  assert.equal(resolveToken(home("{ nope"), never), undefined)
  assert.equal(logged.length, 2)
})

test("token source caches for the window, then re-reads", () => {
  const dir = home({ apiKeyHelper: "/h" })
  const time = clock()
  let calls = 0
  const source = tokenSource({ home: dir, now: time.now, ttl: 30_000, helper: () => `k${++calls}` })
  assert.equal(source.get(), "k1")
  assert.equal(source.get(), "k1")
  time.advance(29_999)
  assert.equal(source.get(), "k1")
  assert.equal(calls, 1)
  time.advance(1)
  assert.equal(source.get(), "k2")
  assert.equal(calls, 2)
})

test("rotation: a changed helper output and a changed literal token are picked up after the window", () => {
  const dir = home({ env: { ANTHROPIC_AUTH_TOKEN: "old" } })
  const time = clock()
  const source = tokenSource({ home: dir, now: time.now, ttl: 30_000, helper: never })
  assert.equal(source.get(), "old")
  writeSettings(dir, { env: { ANTHROPIC_AUTH_TOKEN: "new" } })
  assert.equal(source.get(), "old")
  time.advance(30_000)
  assert.equal(source.get(), "new")
})

test("helper failure at request time keeps the last good value, retries next window, logs by name", () => {
  logged.length = 0
  const dir = home({ apiKeyHelper: "/h" })
  const time = clock()
  const outcomes = [SECRET, undefined, undefined, "rotated"]
  let calls = 0
  const source = tokenSource({ home: dir, now: time.now, ttl: 30_000, helper: () => outcomes[calls++] })
  assert.equal(source.get(), SECRET)
  time.advance(30_000)
  assert.equal(source.get(), SECRET)
  assert.equal(source.get(), SECRET)
  assert.equal(calls, 2)
  time.advance(30_000)
  assert.equal(source.get(), SECRET)
  time.advance(30_000)
  assert.equal(source.get(), "rotated")
  assert.ok(!logged.some((line) => line.includes(SECRET) || line.includes("rotated")))
})

test("a failing helper logs once until it recovers", () => {
  logged.length = 0
  const dir = home({ apiKeyHelper: "sleep 0; exit 4" })
  const time = clock()
  const source = tokenSource({ home: dir, now: time.now, ttl: 1 })
  for (let i = 0; i < 3; i++) {
    source.get()
    time.advance(1)
  }
  assert.deepEqual(logged, ["claude-proxy: apiKeyHelper failed (exit 4)"])
  writeSettings(dir, { apiKeyHelper: `printf ${SECRET}` })
  assert.equal(source.get(), SECRET)
  writeSettings(dir, { apiKeyHelper: "exit 4" })
  time.advance(1)
  source.get()
  assert.equal(logged.length, 2)
})

test("apply sets only the base URL, on the claude-agent provider", () => {
  const calls = []
  const provider = { settings: { timeout: 5 } }
  apply({ update: (id, fn) => (calls.push(id), fn(provider)) }, "http://x")
  assert.deepEqual(calls, ["claude-agent"])
  assert.deepEqual(provider.settings, { timeout: 5, baseURL: "http://x" })
  assert.ok(!JSON.stringify(provider).includes("authToken"))
})

test("apply does nothing without a base URL", () => {
  apply({ update: () => assert.fail("no update expected") }, undefined)
})

function builtinEvent(connection = { ANTHROPIC_BASE_URL: "http://x" }) {
  const models = []
  return {
    models,
    evt: {
      package: "@opencode/claude-agent",
      sdk: { languageModel: (id) => (models.push(id), { modelId: id, connection }) },
    },
  }
}

test("withToken exposes the token to the spawn env at spawn time, not as a stored value", () => {
  const source = { token: "one", get() { return this.token } }
  const { evt } = builtinEvent()
  withToken(source)(evt)
  const model = evt.sdk.languageModel("sonnet")
  assert.equal(model.modelId, "sonnet")
  assert.equal({ ...model.connection }.ANTHROPIC_AUTH_TOKEN, "one")
  source.token = "two"
  assert.equal({ ...model.connection }.ANTHROPIC_AUTH_TOKEN, "two")
  assert.equal(model.connection.ANTHROPIC_BASE_URL, "http://x")
})

test("withToken falls back to the server env value when there is no token", () => {
  const saved = process.env.ANTHROPIC_AUTH_TOKEN
  process.env.ANTHROPIC_AUTH_TOKEN = "from-server-env"
  try {
    const { evt } = builtinEvent()
    withToken({ get: () => undefined })(evt)
    assert.equal({ ...evt.sdk.languageModel("m").connection }.ANTHROPIC_AUTH_TOKEN, "from-server-env")
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
    else process.env.ANTHROPIC_AUTH_TOKEN = saved
  }
})

test("withToken ignores other packages", () => {
  const evt = { package: "@ai-sdk/openai", sdk: { languageModel: () => assert.fail("must not be wrapped") } }
  const original = evt.sdk.languageModel
  withToken({ get: () => SECRET })(evt)
  assert.equal(evt.sdk.languageModel, original)
})

test("shape guard: a changed sdk or connection warns by name, fails soft, and never logs the value", () => {
  logged.length = 0
  const noModel = { package: "@opencode/claude-agent", sdk: {} }
  withToken({ get: () => SECRET })(noModel)
  assert.equal(noModel.sdk.languageModel, undefined)

  const noConnection = { package: "@opencode/claude-agent", sdk: { languageModel: (id) => ({ modelId: id }) } }
  withToken({ get: () => SECRET })(noConnection)
  assert.deepEqual(noConnection.sdk.languageModel("m"), { modelId: "m" })

  const frozen = builtinEvent(Object.freeze({}))
  withToken({ get: () => SECRET })(frozen.evt)
  frozen.evt.sdk.languageModel("m")

  assert.deepEqual(logged, [
    "claude-proxy: claude-agent sdk has no languageModel; token not applied",
    "claude-proxy: claude-agent model has no writable connection env; token not applied",
  ])
  assert.ok(!logged.some((line) => line.includes(SECRET)))
})

test("setup puts only the base URL in the provider settings, hooks the sdk, and never writes process.env", async (t) => {
  const realHome = process.env.HOME
  t.after(() => (process.env.HOME = realHome))
  process.env.HOME = home({ env: { ANTHROPIC_BASE_URL: "http://x", ANTHROPIC_AUTH_TOKEN: SECRET } })
  const before = JSON.stringify(process.env)
  assert.equal(plugin.id, "claude-proxy")
  const transforms = []
  const hooks = []
  await plugin.setup({
    provider: { transform: async (fn) => transforms.push(fn) },
    aisdk: { hook: async (...args) => hooks.push(args) },
  })
  assert.equal(JSON.stringify(process.env), before)
  assert.equal(transforms.length, 1)
  const provider = { settings: {} }
  transforms[0]({ update: (_id, fn) => fn(provider) })
  assert.deepEqual(provider.settings, { baseURL: "http://x" })
  assert.equal(hooks.length, 1)
  assert.equal(hooks[0][0], "sdk")
  assert.deepEqual(hooks[0][2], { providerID: "claude-agent" })

  const { evt } = builtinEvent()
  hooks[0][1](evt)
  assert.equal({ ...evt.sdk.languageModel("m").connection }.ANTHROPIC_AUTH_TOKEN, SECRET)
  assert.ok(!JSON.stringify(provider).includes(SECRET))
})
