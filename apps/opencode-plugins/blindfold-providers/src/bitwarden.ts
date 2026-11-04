import type { Managed } from "./managed.js"
import { Base } from "./account.js"
import { LockedError, originMatches, originOf, type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput } from "./contract.js"
import { apiKeys as keyStore, memoryTokens, type KeyStore } from "./keychain.js"
import { PROBE_MS, classify, type Probe } from "./probe.js"
import { reason, run } from "./run.js"

export type BitwardenOptions = {
  id: string
  label: string
  bin?: string
  /** One data directory per account (BITWARDENCLI_APPDATA_DIR): its `data.json` keeps the login and the server. */
  appDataDir: string
  organizationId?: string
  autoLockMinutes?: number
  allowedOrigins?: readonly string[]
  /** Pull the vault after each unlock (default true). */
  syncOnUnlock?: boolean
  confirmEveryUse?: boolean
  alwaysAllowOtp?: boolean
  /** A saved API key logs in by itself, so unlocking takes only the master password. */
  apiKeys?: KeyStore
}

type Item = { id: string; name: string; organizationId: string | null; login?: { totp?: string | null; uris?: { uri: string }[] } }

const PASSWORD_VARIABLE = "BLINDFOLD_BW_PASSWORD"

/**
 * Bitwarden (cloud, no SSO) through the `bw` CLI: `bw login --apikey` once, then the master password to unlock. The master
 * password goes to the child through its environment (`--passwordenv`), the session (BW_SESSION) lives here and nowhere
 * else, and `bw lock` runs when the idle timer fires: the CLI itself never expires a session.
 */
export class Bitwarden extends Base implements Managed {
  readonly kind = "bitwarden"
  readonly capabilities: Capabilities = { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: ["apiKey", "masterPassword"] }
  private readonly bin: string
  private readonly appData: string
  private readonly organizationId: string | undefined
  private readonly sync: boolean
  private readonly keys: KeyStore

  constructor(options: BitwardenOptions) {
    super(options)
    this.bin = options.bin ?? "bw"
    this.appData = options.appDataDir
    this.organizationId = options.organizationId
    this.sync = options.syncOnUnlock ?? true
    this.keys = options.apiKeys ?? keyStore(memoryTokens(), memoryTokens())
  }

  async hasCredential() {
    return !!(await this.keys.get(this.id))
  }

  private base(extra: Record<string, string> = {}) {
    return { BITWARDENCLI_APPDATA_DIR: this.appData, BW_NOINTERACTION: "true", ...extra }
  }

  async status(): Promise<LockState> {
    const local = await super.status()
    if (local.state === "unlocked") return local
    const result = await run(this.bin, ["status"], this.base())
    if (result.code !== 0) return { state: "unavailable", reason: reason(result) }
    let status: string | undefined
    try {
      status = (JSON.parse(result.stdout) as { status?: string }).status
    } catch {
      return { state: "unavailable", reason: "unexpected output from bw status" }
    }
    // Logged out needs the API key (unless one is saved); logged in needs only the master password.
    return { state: "locked", methods: status === "unauthenticated" && !(await this.hasCredential()) ? ["apiKey"] : ["masterPassword"] }
  }

  async unlock(input: UnlockInput, signal?: AbortSignal) {
    if (input.method !== "apiKey" && input.method !== "masterPassword") throw new Error(`${this.label}: ${input.method} unlock is not supported`)
    const saved = input.method === "masterPassword" ? await this.keys.get(this.id) : undefined
    const given = input.method === "apiKey" && input.clientId && input.clientSecret ? { clientId: input.clientId, clientSecret: input.clientSecret } : undefined
    const secrets = [input.password, ...(input.method === "apiKey" ? [input.clientSecret ?? ""] : []), ...(saved ? [saved.clientSecret] : [])]
    const key = given ?? (saved && (await this.loggedOut(signal)) ? saved : undefined)
    if (key) {
      const login = await run(this.bin, ["login", "--apikey"], this.base({ BW_CLIENTID: key.clientId, BW_CLIENTSECRET: key.clientSecret }), undefined, signal)
      if (login.code !== 0 && !/already logged in/i.test(login.stderr + login.stdout)) throw new Error(`${this.label}: ${reason(login, secrets)}`)
    }
    const unlocked = await run(this.bin, ["unlock", "--raw", "--passwordenv", PASSWORD_VARIABLE], this.base({ [PASSWORD_VARIABLE]: input.password }), undefined, signal)
    if (unlocked.code !== 0 || !unlocked.stdout.trim()) throw new Error(`${this.label}: ${reason(unlocked, secrets)}`)
    const env = this.base({ BW_SESSION: unlocked.stdout.trim() })
    if (this.sync) await run(this.bin, ["sync"], env, undefined, signal)
    this.open({ env, method: input.method })
    return this.status()
  }

  async forget() {
    await this.lock()
    await this.keys.delete(this.id)
  }

  private async loggedOut(signal?: AbortSignal) {
    const result = await run(this.bin, ["status"], this.base(), undefined, signal)
    try {
      return result.code === 0 && (JSON.parse(result.stdout) as { status?: string }).status === "unauthenticated"
    } catch {
      return false
    }
  }

  /** Connection test: signed in and unlocked, then how many collections the account can list. Counts only. */
  async probe(signal?: AbortSignal, timeoutMs = PROBE_MS): Promise<Probe> {
    if (!this.session) {
      const result = await run(this.bin, ["status"], this.base(), undefined, signal, timeoutMs)
      if (result.code !== 0 || result.missing || result.timedOut) return classify(result)
      try {
        const status = (JSON.parse(result.stdout) as { status?: string }).status
        return status === "unauthenticated" ? { ok: false, code: (await this.hasCredential()) ? "locked" : "not_logged_in" } : { ok: false, code: "locked" }
      } catch {
        return { ok: false, code: "other", detail: "unexpected output from bw status" }
      }
    }
    const args = ["list", "collections", "--nointeraction", ...(this.organizationId ? ["--organizationid", this.organizationId] : [])]
    const result = await run(this.bin, args, this.session.env, undefined, signal, timeoutMs)
    if (result.code !== 0 || result.missing || result.timedOut) {
      const failed = classify(result)
      if (failed.code === "locked") await super.lock()
      return failed
    }
    try {
      return { ok: true, code: "ok", count: (JSON.parse(result.stdout || "[]") as unknown[]).length }
    } catch {
      return { ok: false, code: "other", detail: "unexpected output from bw list collections" }
    }
  }

  async lock() {
    if (this.session) await run(this.bin, ["lock"], this.session.env)
    await super.lock()
  }

  private async call(args: string[], signal?: AbortSignal) {
    const result = await run(this.bin, args, this.env(), undefined, signal)
    if (result.code !== 0) {
      if (/locked|not logged in/i.test(result.stderr)) {
        await super.lock()
        throw new LockedError(this.id, ["masterPassword"])
      }
      throw new Error(`${this.label}: ${reason(result)}`)
    }
    return result.stdout
  }

  protected override unlockMethods() {
    return ["masterPassword"] as const
  }

  async findByOrigin(pageOrigin: string, signal?: AbortSignal) {
    const hit = this.cached(pageOrigin)
    if (hit) return hit
    // `bw list` returns decrypted items, values included: parse here, keep the reference, drop the rest.
    const raw = JSON.parse(await this.call(["list", "items", "--url", pageOrigin, "--nointeraction"], signal)) as Item[]
    const items = raw
      .filter((item) => !this.organizationId || item.organizationId === this.organizationId)
      .map((item): ItemRef => ({
        account: this.id,
        id: item.id,
        title: item.name,
        origins: (item.login?.uris ?? []).map((uri) => originOf(uri.uri)).filter((origin): origin is string => !!origin),
        hasOtp: !!item.login?.totp,
        fields: ["username", "password", ...(item.login?.totp ? ["otp"] : [])],
      }))
      .filter((item) => item.origins.some((origin) => originMatches(origin, pageOrigin)))
    this.cache.set(pageOrigin, { at: Date.now(), items })
    return items
  }

  async resolve(reference: string) {
    const match = reference.match(/^bw:([^/]+)\/(username|password|otp)$/)
    if (!match) throw new Error(`${this.label}: not a bw:<id>/<field> reference`)
    return { item: { account: this.id, id: match[1]!, title: match[1]!, origins: [], hasOtp: match[2] === "otp", fields: [match[2]!] }, field: match[2] as FieldRef }
  }

  async read(item: ItemRef, field: FieldRef, signal?: AbortSignal) {
    const what = field === "otp" ? "totp" : typeof field === "string" ? field : undefined
    if (!what) throw new Error(`${this.label}: custom fields are not supported`)
    return this.call(["get", what, item.id, "--nointeraction"], signal)
  }
}
