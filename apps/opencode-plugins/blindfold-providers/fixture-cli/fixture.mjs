#!/usr/bin/env node
// Fixture stand-ins for `op` and `bw`: the subset of commands, flags, outputs and errors the providers use, from the
// vendors' docs (DESIGN §1). Fake vault, fake values. Invoked through the `op` and `bw` wrappers next to this file.
// State (sessions) lives in $FIXTURE_STATE. Every argv is appended to $FIXTURE_STATE/argv.log so tests can prove no
// secret is ever passed as an argument.
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createHmac, randomBytes } from "node:crypto"
import { join } from "node:path"

const [tool, ...args] = process.argv.slice(2)
const state = process.env.FIXTURE_STATE ?? "/tmp/blindfold-fixture"
mkdirSync(state, { recursive: true })
appendFileSync(join(state, "argv.log"), JSON.stringify([tool, ...args]) + "\n")
// What the child was given, without values: whether the 1Password app integration was switched off, and which kind of credential.
appendFileSync(join(state, "env.log"), JSON.stringify({ tool, bio: process.env.OP_BIOMETRIC_UNLOCK_ENABLED ?? null, service: !!process.env.OP_SERVICE_ACCOUNT_TOKEN, inheritedSession: !!process.env.OP_SESSION_inherited }) + "\n")

const PASSWORD = { op: "fixture-op-master", bw: "fixture-bw-master" }
const SERVICE_TOKEN = "ops_fixture_service_token"
const BW_API = { id: "user.fixture-client", secret: "fixture-client-secret" }
const OTP_SEED = "JBSWY3DPEHPK3PXP" // RFC 6238 test-style base32 seed, fake

const VAULT = [
  { id: "op1", vaultId: "vlt_agent", vault: "Agent", title: "Google (personal)", urls: ["https://accounts.google.com"], username: "personal.fixture@example.test", password: "fixture-google-pw", otp: true },
  { id: "op2", vaultId: "vlt_agent", vault: "Agent", title: "GitHub", urls: ["https://github.com"], username: "fixture-gh", password: "fixture-gh-pw", otp: true },
  { id: "op4", vaultId: "vlt_agent", vault: "Agent", title: "Local login (test page)", urls: ["http://127.0.0.1:47321"], username: "ada.fixture@example.test", password: "fixture-local-pw", otp: false },
  { id: "op3", vaultId: "vlt_private", vault: "Private", title: "Bank", urls: ["https://bank.example"], username: "x", password: "fixture-bank-pw", otp: false },
]
const BW_VAULT = [
  { id: "bw1", organizationId: "org-work", name: "Holibob admin", uris: ["https://admin.holibob.tech"], username: "work.fixture@holibob.test", password: "fixture-holibob-pw", totp: OTP_SEED },
  { id: "bw2", organizationId: "org-work", name: "Google (work)", uris: ["https://accounts.google.com"], username: "work.fixture@example.test", password: "fixture-gwork-pw", totp: null },
]

function totp(seed, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const c of seed) bits += alphabet.indexOf(c).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)))
  const h = createHmac("sha1", key).update(counter).digest()
  const o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)
const fail = (message, code = 1) => {
  process.stderr.write(message + "\n")
  process.exit(code)
}
const sessionToken = () => process.env[Object.keys(process.env).find((key) => key.startsWith("OP_SESSION_") && key !== "OP_SESSION_inherited") ?? "OP_SESSION"]
const sessions = () => (existsSync(join(state, `${tool}-sessions.json`)) ? JSON.parse(readFileSync(join(state, `${tool}-sessions.json`), "utf8")) : {})
const saveSessions = (s) => writeFileSync(join(state, `${tool}-sessions.json`), JSON.stringify(s))
const stdin = () => (process.stdin.isTTY ? "" : readFileSync(0, "utf8").replace(/\n$/, ""))

if (tool === "op") {
  if (has("--version")) {
    console.log("2.30.3-fixture")
    process.exit(0)
  }
  // Failure modes for the connection test: FIXTURE_OP_MODE=rate_limit | hang | app_prompt | not_vault
  // The mode may also be a file, for a CLI started by a service whose environment cannot change: $FIXTURE_STATE/op-mode.
  const modeFile = join(state, "op-mode")
  const mode = process.env.FIXTURE_OP_MODE ?? (existsSync(modeFile) ? readFileSync(modeFile, "utf8").trim() : undefined)
  if (mode === "rate_limit") fail("[ERROR] 2026/11/03 00:00:00 You have made too many requests. Wait and try again (rate limit exceeded)")
  if (mode === "hang") setInterval(() => undefined, 1000)
  if (mode === "hang") await new Promise(() => undefined)
  if (mode === "app_prompt") fail("[ERROR] 2026/11/03 00:00:00 authorization prompt dismissed: the 1Password app integration needs your approval")
  const IDLE = Number(process.env.FIXTURE_OP_IDLE_MS ?? 30 * 60_000)
  // Authorisation: service account (Agent vault only) or a manual-sign-in session token (all vaults, 30 min idle).
  function scope() {
    if (process.env.OP_SERVICE_ACCOUNT_TOKEN) {
      if (process.env.OP_SERVICE_ACCOUNT_TOKEN !== SERVICE_TOKEN) fail("[ERROR] 2026/11/03 00:00:00 invalid service account token")
      return ["Agent"]
    }
    // Without a token or a session `op` would ask the 1Password app ("Allow opencode-cli to get CLI access"). Count it.
    if (process.env.OP_BIOMETRIC_UNLOCK_ENABLED !== "false") {
      appendFileSync(join(state, "app-prompts.log"), "prompt\n")
      fail("[ERROR] 2026/11/03 00:00:00 fixture: the app integration would have prompted")
    }
    const token = sessionToken()
    const all = sessions()
    const session = token && all[token]
    if (!session || Date.now() - session.used > IDLE) fail("[ERROR] 2026/11/03 00:00:00 You are not currently signed in. Please run `op signin --help` for instructions")
    session.used = Date.now()
    saveSessions(all)
    return ["Agent", "Private"]
  }
  const [cmd, sub] = args
  if (cmd === "signin") {
    if (process.env.OP_BIOMETRIC_UNLOCK_ENABLED !== "false") fail("[ERROR] fixture: app integration is on; this fixture models only manual sign-in")
    if (stdin() !== PASSWORD.op) fail("[ERROR] 2026/11/03 00:00:00 Authentication: (401) Unauthorized, You aren't authorized to perform this action")
    const token = randomBytes(24).toString("base64url")
    saveSessions({ ...sessions(), [token]: { used: Date.now() } })
    process.stdout.write(token)
    process.exit(0)
  }
  if (cmd === "signout") {
    const token = sessionToken()
    const all = sessions()
    delete all[token]
    saveSessions(all)
    process.exit(0)
  }
  const vaults = scope()
  const asked = flag("--vault")
  if (asked && !["Agent", "Private", "vlt_agent", "vlt_private"].includes(asked)) fail(`[ERROR] 2026/11/03 00:00:00 "${asked}" isn't a vault in this account. Specify the vault with its UUID, name, or ID.`)
  const visible = VAULT.filter((item) => vaults.includes(item.vault))
  if (cmd === "item" && sub === "list") {
    // Like op: overview only, no field values; urls carry the origins.
    console.log(JSON.stringify(visible.map((i) => ({ id: i.id, title: i.title, vault: { id: i.vaultId, name: i.vault }, category: "LOGIN", urls: i.urls.map((href, n) => ({ href, primary: n === 0 })) }))))
    process.exit(0)
  }
  if (cmd === "item" && sub === "get") {
    const item = visible.find((i) => i.id === args[2] || i.title === args[2])
    if (!item) fail(`[ERROR] 2026/11/03 00:00:00 "${args[2]}" isn't an item. Specify the item with its UUID, name, or domain.`)
    if (has("--otp")) {
      if (!item.otp) fail("[ERROR] 2026/11/03 00:00:00 item has no one-time password field")
      process.stdout.write(totp(OTP_SEED) + "\n")
      process.exit(0)
    }
    const field = (flag("--fields") ?? "").replace(/^label=/, "")
    if (!(field in item)) fail(`[ERROR] fixture: no field ${field}`)
    process.stdout.write(item[field] + "\n")
    process.exit(0)
  }
  if (cmd === "read") {
    const ref = args.find((a) => a.startsWith("op://"))
    const m = ref && ref.match(/^op:\/\/([^/]+)\/([^/]+)\/([^?]+)(\?attribute=otp)?$/)
    const item = m && visible.find((i) => (i.vault === m[1] || i.vaultId === m[1]) && (i.title === m[2] || i.id === m[2]))
    if (!item) fail(`[ERROR] 2026/11/03 00:00:00 could not read secret '${ref}': error resolving item`)
    process.stdout.write(m[4] ? totp(OTP_SEED) : item[m[3]])
    process.exit(0)
  }
  fail(`fixture op: unsupported ${args.join(" ")}`, 2)
}

if (tool === "security") {
  // The login keychain, as far as blindfold uses it: add-generic-password through `-i` (stdin), find, delete.
  const file = join(state, "keychain.json")
  const store = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}
  const save = () => writeFileSync(file, JSON.stringify(store))
  const parse = (line) => {
    const words = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
    const get = (flag) => words[words.indexOf(flag) + 1]
    return { command: words[0], service: get("-s"), password: get("-w") }
  }
  if (args[0] === "-i") {
    for (const line of stdin().split("\n").filter(Boolean)) {
      const { command, service, password } = parse(line)
      if (command !== "add-generic-password") fail(`fixture security: unsupported ${command}`, 2)
      store[service] = password
    }
    save()
    process.exit(0)
  }
  if (args[0] === "find-generic-password") {
    const service = args[args.indexOf("-s") + 1]
    if (!(service in store)) fail("security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.", 44)
    process.stdout.write(store[service] + "\n")
    process.exit(0)
  }
  if (args[0] === "delete-generic-password") {
    delete store[args[args.indexOf("-s") + 1]]
    save()
    process.exit(0)
  }
  fail(`fixture security: unsupported ${args.join(" ")}`, 2)
}

if (tool === "bw") {
  if (has("--version")) {
    console.log("2026.10.0-fixture")
    process.exit(0)
  }
  const dir = process.env.BITWARDENCLI_APPDATA_DIR ?? join(state, "bw-default")
  mkdirSync(dir, { recursive: true })
  const dataFile = join(dir, "data.json")
  const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : { loggedIn: false, sessions: [] }
  const save = () => writeFileSync(dataFile, JSON.stringify(data))
  const unlocked = () => data.loggedIn && data.sessions.includes(process.env.BW_SESSION ?? flag("--session"))
  const [cmd, what, id] = args
  if (cmd === "status") {
    console.log(JSON.stringify({ serverUrl: "https://vault.bitwarden.example", status: !data.loggedIn ? "unauthenticated" : unlocked() ? "unlocked" : "locked" }))
    process.exit(0)
  }
  if (cmd === "login" && has("--apikey")) {
    if (process.env.BW_CLIENTID !== BW_API.id || process.env.BW_CLIENTSECRET !== BW_API.secret) fail("client_id or client_secret is incorrect. Try again.")
    data.loggedIn = true
    save()
    console.log("You are logged in!")
    process.exit(0)
  }
  if (cmd === "unlock") {
    if (!data.loggedIn) fail("You are not logged in.")
    const env = flag("--passwordenv")
    const password = env ? process.env[env] : stdin()
    if (password !== PASSWORD.bw) fail("Invalid master password.")
    const key = randomBytes(32).toString("base64")
    data.sessions.push(key)
    save()
    process.stdout.write(has("--raw") ? key : `export BW_SESSION="${key}"\n`)
    process.exit(0)
  }
  if (cmd === "sync") {
    console.log("Syncing complete.")
    process.exit(0)
  }
  if (cmd === "lock") {
    data.sessions = []
    save()
    console.log("Your vault is locked.")
    process.exit(0)
  }
  if (!unlocked()) fail(data.loggedIn ? "Vault is locked." : "You are not logged in.")
  if (cmd === "list" && what === "collections") {
    const org = flag("--organizationid")
    if (org && org !== "org-work") fail("Organization not found.")
    console.log(JSON.stringify([{ object: "collection", id: "col1", organizationId: "org-work", name: "Agents" }, { object: "collection", id: "col2", organizationId: "org-work", name: "Shared" }]))
    process.exit(0)
  }
  if (cmd === "list" && what === "items") {
    // Like bw: full decrypted items, values included. The provider must parse in process and never log stdout.
    const url = flag("--url")
    const host = url && new URL(url).hostname
    const items = BW_VAULT.filter((i) => !host || i.uris.some((u) => new URL(u).hostname === host || host.endsWith("." + new URL(u).hostname)))
    console.log(JSON.stringify(items.map((i) => ({ object: "item", id: i.id, organizationId: i.organizationId, name: i.name, type: 1, login: { username: i.username, password: i.password, totp: i.totp, uris: i.uris.map((uri) => ({ uri, match: null })) } }))))
    process.exit(0)
  }
  if (cmd === "get") {
    const item = BW_VAULT.find((i) => i.id === id)
    if (!item) fail("Not found.")
    if (what === "totp") {
      if (!item.totp) fail("No TOTP available for this login.")
      process.stdout.write(totp(item.totp))
    } else if (what === "password" || what === "username") process.stdout.write(item[what])
    else fail(`fixture bw: unsupported get ${what}`, 2)
    process.exit(0)
  }
  fail(`fixture bw: unsupported ${args.join(" ")}`, 2)
}
fail(`fixture: unknown tool ${tool}`, 2)
