#!/usr/bin/env node
// Self-check for blindfold-providers: tests each configured account with the real CLI, without changing anything in it.
// For each account: status, unlock (asks for the credential here, masked), a listing of the logins saved for an origin
// (titles and which fields exist, never values), and optionally one read of an item you name (reports only how many
// characters came back, and for a one-time code whether it is six digits). The account is locked again at the end.
//
//   node check.mjs [--config <file>] [--account <id>] [--origin <url>] [--item <title>] [--field username|password|otp]
//                  [--ref <op://vault/item/field | bw:<id>/field>] [--keychain] [--security <bin>]
//
// --config    a file with `{ "accounts": { ... } }` or an opencode.json that lists blindfold-providers with options
//             (default ~/.config/opencode/opencode.json, read only)
// --origin    page URL whose logins to list, e.g. https://github.com
// --item      the title of the one login to read a field of (default: the first for the origin); --field says which (default password)
// --ref       read one explicit reference instead
// --keychain  1Password service accounts only: writes a dummy item to the login keychain and deletes it, and checks that
//             `security -i` does not echo what it was given
//
// When stdin is not a terminal, secrets are read from it, one per line, in the order they are asked (for scripts and tests).
// Nothing secret is printed, logged or written; a value is never shown, only its length.
import { createInterface } from "node:readline"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseAccounts } from "./dist/config.js"
import { keychainTokens } from "./dist/keychain.js"
import { run } from "./dist/run.js"

const argv = process.argv.slice(2)
const option = (name) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? argv[at + 1] : undefined
}
const flag = (name) => argv.includes(`--${name}`)

const results = []
const note = (ok, text) => {
  results.push(ok)
  console.log(`${ok ? "  ok   " : "  FAIL "}${text}`)
}
const info = (text) => console.log(`       ${text}`)
const timed = async (task) => {
  const started = Date.now()
  const value = await task()
  return [value, Date.now() - started]
}

// ---- Config ----
const stripComments = (text) => text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")
function loadOptions() {
  const file = option("config") ?? join(homedir(), ".config", "opencode", "opencode.json")
  const raw = JSON.parse(stripComments(readFileSync(file, "utf8")))
  if (raw.accounts) return { file, options: raw }
  const entry = (raw.plugins ?? []).find((item) => typeof item === "object" && /blindfold-providers\/?$/.test(item.package ?? ""))
  if (!entry?.options) throw new Error(`${file} has no blindfold-providers entry with options, and no "accounts"`)
  return { file, options: entry.options }
}

// ---- Prompts ----
const lines = process.stdin.isTTY ? undefined : createInterface({ input: process.stdin })[Symbol.asyncIterator]()
async function secret(label) {
  if (lines) return ((await lines.next()).value ?? "").trim()
  process.stdout.write(`       ${label}: `)
  return new Promise((resolve) => {
    let text = ""
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off("data", onData)
          process.stdout.write("\n")
          return resolve(text)
        }
        if (char === "\u0003") process.exit(130)
        text = char === "\u007f" ? text.slice(0, -1) : text + char
      }
    }
    process.stdin.on("data", onData)
  })
}
const LABELS = { password: "Master password", token: "Service account token", clientId: "Client ID", clientSecret: "Client secret" }

async function credentials(method) {
  if (method === "masterPassword") return { method, password: await secret(LABELS.password) }
  if (method === "serviceAccount") return { method, token: await secret(LABELS.token) }
  return { method, clientId: await secret(LABELS.clientId), clientSecret: await secret(LABELS.clientSecret), password: await secret(LABELS.password) }
}

// ---- Checks ----
async function checkAccount(account) {
  console.log(`\n${account.label}  [${account.id}, ${account.kind}]`)
  let [state, ms] = await timed(() => account.status())
  if (state.state === "unavailable") return note(false, `status: unavailable, ${state.reason} (${ms} ms). Install the CLI and check the account settings.`)
  note(true, `status: ${state.state} (${ms} ms)${state.state === "locked" ? `, unlock by ${state.methods.join(" or ")}` : ""}`)
  if (state.state === "locked") {
    try {
      const input = await credentials(state.methods[0])
      ;[state, ms] = await timed(() => account.unlock(input))
      note(state.state === "unlocked", `unlock (${input.method}): ${state.state} (${ms} ms)`)
    } catch (error) {
      return note(false, `unlock: ${error instanceof Error ? error.message : "failed"}`)
    }
  }
  const origin = option("origin")
  const ref = option("ref")
  let item
  let field = option("field") ?? "password"
  try {
    if (origin) {
      const [items, listMs] = await timed(() => account.findByOrigin(origin))
      note(true, `logins for ${origin}: ${items.length} (${listMs} ms)${items.length === 0 ? ", none saved for this site in this account" : ""}`)
      for (const entry of items.slice(0, 5)) info(`- ${entry.title}: has ${entry.fields.join(", ")}`)
      const wanted = option("item")
      item = wanted ? items.find((entry) => entry.title === wanted) : items[0]
      if (wanted && !item) note(false, `no login titled "${wanted}" for ${origin}`)
    } else if (ref) {
      const resolved = await account.resolve(ref)
      item = resolved.item
      field = resolved.field
    }
    if (item) {
      const [value, readMs] = await timed(() => account.read(item, field))
      const otp = field === "otp"
      note(value.length > 0 && (!otp || /^\d{6,8}$/.test(value.trim())), `read ${typeof field === "string" ? field : field.label} of "${item.title}": ${value.length} characters${otp ? `, ${/^\d{6,8}$/.test(value.trim()) ? "a numeric code" : "not a numeric code"}` : ""} (${readMs} ms)`)
    } else if (!origin && !ref) info("nothing read: pass --origin <url> (and --item) or --ref to read a login")
  } catch (error) {
    note(false, `${error instanceof Error ? error.message : "failed"}`)
  }
  await account.lock()
  const [after] = await timed(() => account.status())
  note(true, `locked again: ${after.state === "unlocked" ? "a service account token reopens itself from the keychain, as designed" : after.state}`)
}

async function checkKeychain() {
  console.log("\nKeychain (dummy item, deleted at the end)")
  const bin = option("security") ?? "security"
  const store = keychainTokens(bin)
  const dummy = "ops_selfcheck_dummy_token_0123456789"
  const wrote = await store.set("selfcheck", dummy)
  note(wrote, "write through `security -i` on stdin")
  note((await store.get("selfcheck")) === dummy, "read back with find-generic-password -w")
  // Does `security -i` repeat the line it was given?
  const echoed = await run(bin, ["-i"], {}, `add-generic-password -U -s blindfold-op-selfcheck -a opencode -w "${dummy}"\n`)
  note(!(echoed.stdout + echoed.stderr).includes(dummy), "`security -i` does not echo the token")
  await store.delete("selfcheck")
  note((await store.get("selfcheck")) === undefined, "deleted")
}

// ---- Run ----
let loaded
try {
  loaded = loadOptions()
} catch (error) {
  console.error(`Could not read the configuration: ${error.message}`)
  process.exit(2)
}
console.log(`blindfold-providers self-check (config: ${loaded.file})`)
let accounts
try {
  accounts = parseAccounts(loaded.options).map((built) => built.make())
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
const only = option("account")
const chosen = accounts.filter((account) => only === undefined || account.id === only)
if (chosen.length === 0) {
  console.error(only ? `No account "${only}". Accounts: ${accounts.map((account) => account.id).join(", ")}` : "No accounts are configured.")
  process.exit(2)
}
for (const account of chosen) await checkAccount(account)
if (flag("keychain")) await checkKeychain()
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} ok, ${failed} failed`)
console.log("1Password service accounts allow 1,000 requests a day (individual plans); this check used about two per account.")
process.exit(failed ? 1 : 0)
