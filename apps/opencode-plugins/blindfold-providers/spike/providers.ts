// Spike providers for 1Password (`op`) and Bitwarden (`bw`), run against the fixture CLIs. No biometrics anywhere:
// 1Password unlocks by service-account token or by master password (`op signin` with the app integration off);
// Bitwarden logs in with the API key and unlocks by master password. Secrets reach the CLI only through stdin or the
// child's environment, never argv (visible in `ps`). Sessions live in this object only, and lock after idle minutes.
import { execFile } from "node:child_process"
import { LockedError, type Account, type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput, type UnlockMethod } from "./contract.ts"

type Run = { code: number; stdout: string; stderr: string }

function run(bin: string, args: string[], env: Record<string, string | undefined>, input?: string, signal?: AbortSignal): Promise<Run> {
  return new Promise((resolve) => {
    const child = execFile(bin, args, { env: { ...process.env, ...env }, timeout: 30_000, signal, maxBuffer: 8 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    })
    child.stdin?.end(input ?? "")
  })
}

/** The CLI's own error text, first line, with anything that looks like a value replaced. Values never reach errors. */
const reason = (stderr: string) => stderr.split("\n")[0]!.replace(/\[ERROR\] \S+ \S+ /, "").slice(0, 200)

export function origin(url: string) {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`
  } catch {
    return undefined
  }
}

/** Same scheme and host, or the page is a subdomain of the item's host. Never the reverse. */
export function originMatches(itemOrigin: string, pageOrigin: string) {
  const a = new URL(itemOrigin)
  const b = new URL(pageOrigin)
  if (a.protocol !== b.protocol || a.port !== b.port) return false
  return b.hostname === a.hostname || b.hostname.endsWith("." + a.hostname)
}

abstract class Base implements Account {
  abstract readonly kind: string
  abstract readonly capabilities: Capabilities
  readonly id: string
  readonly label: string
  protected session: { env: Record<string, string>; method: UnlockMethod; used: number } | undefined
  readonly autoLockMs: number
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(id: string, label: string, autoLockMinutes = 10) {
    this.id = id
    this.label = label
    this.autoLockMs = autoLockMinutes * 60_000
  }

  protected touch() {
    if (!this.session) return
    this.session.used = Date.now()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.lock(), this.autoLockMs)
    this.timer.unref?.()
  }

  protected env() {
    if (!this.session) throw new LockedError(this.id, this.capabilities.unlock)
    this.touch()
    return this.session.env
  }

  async status(): Promise<LockState> {
    if (this.session) return { state: "unlocked", method: this.session.method, expiresAt: this.session.used + this.autoLockMs }
    return { state: "locked", methods: this.capabilities.unlock }
  }

  async lock() {
    clearTimeout(this.timer)
    this.session = undefined
  }

  abstract unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>
  abstract findByOrigin(origin: string, signal?: AbortSignal): Promise<readonly ItemRef[]>
  abstract resolve(reference: string, signal?: AbortSignal): Promise<{ item: ItemRef; field: FieldRef }>
  abstract read(item: ItemRef, field: FieldRef, signal?: AbortSignal): Promise<string>
}

export class OnePassword extends Base {
  readonly kind = "1password"
  readonly capabilities: Capabilities = { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: ["serviceAccount", "masterPassword"] }
  private readonly bin: string
  private readonly address: string

  constructor(options: { id: string; label: string; bin?: string; address?: string; autoLockMinutes?: number }) {
    super(options.id, options.label, options.autoLockMinutes)
    this.bin = options.bin ?? "op"
    this.address = options.address ?? "my.1password.com"
  }

  async unlock(input: UnlockInput, signal?: AbortSignal) {
    if (input.method === "serviceAccount") {
      // Checked by one cheap call; the token is the session.
      const env = { OP_SERVICE_ACCOUNT_TOKEN: input.token }
      const probe = await run(this.bin, ["item", "list", "--format", "json"], env, undefined, signal)
      if (probe.code !== 0) throw new Error(`${this.label}: ${reason(probe.stderr)}`)
      this.session = { env, method: "serviceAccount", used: Date.now() }
    } else if (input.method === "masterPassword") {
      // App integration off for this child only: no app prompt, no biometrics. Password on stdin.
      const signin = await run(this.bin, ["signin", "--raw", "--account", this.address], { OP_BIOMETRIC_UNLOCK_ENABLED: "false" }, input.password, signal)
      if (signin.code !== 0 || !signin.stdout) throw new Error(`${this.label}: ${reason(signin.stderr)}`)
      this.session = { env: { OP_BIOMETRIC_UNLOCK_ENABLED: "false", OP_SESSION_personal: signin.stdout.trim(), OP_SESSION: signin.stdout.trim() }, method: "masterPassword", used: Date.now() }
    } else throw new Error(`${this.label}: ${input.method} unlock is not supported`)
    this.touch()
    return this.status()
  }

  async lock() {
    if (this.session?.method === "masterPassword") await run(this.bin, ["signout"], this.session.env)
    await super.lock()
  }

  private async call(args: string[], signal?: AbortSignal) {
    const result = await run(this.bin, args, this.env(), undefined, signal)
    if (result.code !== 0) {
      if (/not currently signed in/.test(result.stderr)) {
        await super.lock()
        throw new LockedError(this.id, this.capabilities.unlock)
      }
      throw new Error(`${this.label}: ${reason(result.stderr)}`)
    }
    return result.stdout
  }

  async findByOrigin(pageOrigin: string, signal?: AbortSignal) {
    const items = JSON.parse(await this.call(["item", "list", "--categories", "Login", "--format", "json"], signal)) as { id: string; title: string; urls?: { href: string }[] }[]
    return items
      .map((i) => ({ account: this.id, id: i.id, title: i.title, origins: (i.urls ?? []).map((u) => origin(u.href)).filter((o): o is string => !!o), hasOtp: true, fields: ["username", "password", "otp"] }))
      .filter((i) => i.origins.some((o) => originMatches(o, pageOrigin)))
  }

  async resolve(reference: string) {
    const m = reference.match(/^op:\/\/([^/]+)\/([^/]+)\/([^?]+)(\?attribute=otp)?$/)
    if (!m) throw new Error(`${this.label}: not an op:// reference`)
    const field: FieldRef = m[4] ? "otp" : m[3] === "password" || m[3] === "username" ? m[3] : { label: m[3]! }
    return { item: { account: this.id, id: reference, title: `${m[1]}/${m[2]}`, origins: [], hasOtp: !!m[4], fields: [m[3]!] }, field }
  }

  async read(item: ItemRef, field: FieldRef, signal?: AbortSignal) {
    if (item.id.startsWith("op://")) return this.call(["read", "--no-newline", item.id], signal)
    if (field === "otp") return (await this.call(["item", "get", item.id, "--otp"], signal)).trim()
    const label = typeof field === "string" ? field : field.label
    return (await this.call(["item", "get", item.id, "--fields", `label=${label}`, "--reveal"], signal)).replace(/\n$/, "")
  }
}

export class Bitwarden extends Base {
  readonly kind = "bitwarden"
  readonly capabilities: Capabilities = { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: ["masterPassword", "apiKey"] }
  private readonly bin: string
  private readonly appData: string
  private readonly organizationId: string | undefined

  constructor(options: { id: string; label: string; bin?: string; appDataDir: string; organizationId?: string; autoLockMinutes?: number }) {
    super(options.id, options.label, options.autoLockMinutes)
    this.bin = options.bin ?? "bw"
    this.appData = options.appDataDir
    this.organizationId = options.organizationId
  }

  private base(extra: Record<string, string> = {}) {
    return { BITWARDENCLI_APPDATA_DIR: this.appData, ...extra }
  }

  async status(): Promise<LockState> {
    const local = await super.status()
    if (local.state === "unlocked") return local
    const s = await run(this.bin, ["status"], this.base())
    if (s.code !== 0) return { state: "unavailable", reason: reason(s.stderr) }
    const status = JSON.parse(s.stdout).status
    // Logged out needs the API key (or an interactive `bw login` the user does once); logged in needs the password.
    return { state: "locked", methods: status === "unauthenticated" ? ["apiKey"] : ["masterPassword"] }
  }

  async unlock(input: UnlockInput, signal?: AbortSignal) {
    if (input.method === "apiKey") {
      const login = await run(this.bin, ["login", "--apikey"], this.base({ BW_CLIENTID: input.clientId, BW_CLIENTSECRET: input.clientSecret }), undefined, signal)
      if (login.code !== 0 && !/already logged in/i.test(login.stderr)) throw new Error(`${this.label}: ${reason(login.stderr || login.stdout)}`)
    } else if (input.method !== "masterPassword") throw new Error(`${this.label}: ${input.method} unlock is not supported`)
    // --passwordenv names a variable of the child's env: the password is in no argv and no file.
    const unlock = await run(this.bin, ["unlock", "--raw", "--passwordenv", "BLINDFOLD_BW_PASSWORD"], this.base({ BLINDFOLD_BW_PASSWORD: input.password }), undefined, signal)
    if (unlock.code !== 0 || !unlock.stdout) throw new Error(`${this.label}: ${reason(unlock.stderr)}`)
    this.session = { env: this.base({ BW_SESSION: unlock.stdout.trim() }), method: input.method === "apiKey" ? "apiKey" : "masterPassword", used: Date.now() }
    this.touch()
    return this.status()
  }

  async lock() {
    // bw sessions never expire on their own (DESIGN B3): lock explicitly.
    if (this.session) await run(this.bin, ["lock"], this.session.env)
    await super.lock()
  }

  private async call(args: string[], signal?: AbortSignal) {
    const result = await run(this.bin, args, this.env(), undefined, signal)
    if (result.code !== 0) {
      if (/locked|not logged in/i.test(result.stderr)) {
        await super.lock()
        throw new LockedError(this.id, this.capabilities.unlock)
      }
      throw new Error(`${this.label}: ${reason(result.stderr)}`)
    }
    return result.stdout
  }

  async findByOrigin(pageOrigin: string, signal?: AbortSignal) {
    // bw list returns decrypted items, values included: parse here, keep only the reference, drop the rest.
    const raw = JSON.parse(await this.call(["list", "items", "--url", pageOrigin], signal)) as { id: string; name: string; organizationId: string | null; login?: { username?: string; password?: string; totp?: string | null; uris?: { uri: string }[] } }[]
    return raw
      .filter((i) => !this.organizationId || i.organizationId === this.organizationId)
      .map((i) => ({ account: this.id, id: i.id, title: i.name, origins: (i.login?.uris ?? []).map((u) => origin(u.uri)).filter((o): o is string => !!o), hasOtp: !!i.login?.totp, fields: ["username", "password", ...(i.login?.totp ? ["otp"] : [])] }))
      .filter((i) => i.origins.some((o) => originMatches(o, pageOrigin)))
  }

  async resolve(reference: string) {
    const m = reference.match(/^bw:([^/]+)\/(username|password|otp)$/)
    if (!m) throw new Error(`${this.label}: not a bw:<id>/<field> reference`)
    return { item: { account: this.id, id: m[1]!, title: m[1]!, origins: [], hasOtp: m[2] === "otp", fields: [m[2]!] }, field: m[2] as FieldRef }
  }

  async read(item: ItemRef, field: FieldRef, signal?: AbortSignal) {
    const what = field === "otp" ? "totp" : typeof field === "string" ? field : undefined
    if (!what) throw new Error(`${this.label}: custom fields need bw get item (not in the spike)`)
    return this.call(["get", what, item.id], signal)
  }
}

// ---- Routing: which account serves a request (blindfold's side) ----

export type Route = { kind: "account"; account: string } | { kind: "ask"; candidates: { account: string; label: string; items: ItemRef[] }[] } | { kind: "none" }

/**
 * Accounts allowed for the origin by the rules, then those that actually hold an item for it. One: use it. Several: ask
 * in the card (labels shown), and remember the choice per origin. None: fall back to typing.
 */
export async function route(pageOrigin: string, accounts: readonly Account[], allowed: (account: string, origin: string) => boolean, remembered: Map<string, string>): Promise<Route> {
  const permitted = accounts.filter((a) => allowed(a.id, pageOrigin))
  const memo = remembered.get(pageOrigin)
  if (memo && permitted.some((a) => a.id === memo)) return { kind: "account", account: memo }
  const found = await Promise.all(permitted.map(async (a) => ({ account: a.id, label: a.label, items: [...(await a.findByOrigin(pageOrigin))] })))
  const holding = found.filter((f) => f.items.length > 0)
  if (holding.length === 0) return { kind: "none" }
  if (holding.length === 1) return { kind: "account", account: holding[0]!.account }
  return { kind: "ask", candidates: holding }
}
