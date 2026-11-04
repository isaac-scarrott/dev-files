import type { Managed } from "./managed.js"
import { Base } from "./account.js"
import { LockedError, originMatches, originOf, type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput } from "./contract.js"
import { memoryTokens, type TokenStore } from "./keychain.js"
import { PROBE_MS, classify, type Probe } from "./probe.js"
import { reason, run } from "./run.js"

export type OnePasswordOptions = {
  id: string
  label: string
  /** `serviceAccount` (default): a token for a vault-scoped machine identity, no app and no prompt. `masterPassword`: the whole account. */
  method?: "serviceAccount" | "masterPassword"
  bin?: string
  /** Sign-in address for `masterPassword`. */
  address?: string
  /** `op` account shorthand for `masterPassword` (its session variable is OP_SESSION_<shorthand>). Defaults to the id. */
  shorthand?: string
  /** An environment variable of the service that holds the token. The keychain is looked at first. */
  tokenEnv?: string
  vaults?: readonly string[]
  tokens?: TokenStore
  autoLockMinutes?: number
  allowedOrigins?: readonly string[]
  confirmEveryUse?: boolean
  alwaysAllowOtp?: boolean
}

type Overview = { id: string; title: string; vault?: { id?: string; name?: string }; urls?: { href: string }[] }

/**
 * 1Password through the `op` CLI, with the desktop-app integration off on every call (OP_BIOMETRIC_UNLOCK_ENABLED=false):
 * `op` never asks the 1Password app, so no "Allow opencode-cli" dialog and no biometrics.
 */
export class OnePassword extends Base implements Managed {
  readonly kind = "1password"
  readonly capabilities: Capabilities
  private readonly bin: string
  private readonly method: "serviceAccount" | "masterPassword"
  private readonly address: string
  private readonly shorthand: string
  private readonly tokenEnv: string | undefined
  private readonly vaults: readonly string[]
  private readonly tokens: TokenStore

  constructor(options: OnePasswordOptions) {
    super(options)
    this.method = options.method ?? "serviceAccount"
    this.capabilities = { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: [this.method] }
    this.bin = options.bin ?? "op"
    this.address = options.address ?? "my.1password.com"
    this.shorthand = options.shorthand ?? options.id
    this.tokenEnv = options.tokenEnv
    this.vaults = options.vaults ?? []
    this.tokens = options.tokens ?? memoryTokens()
  }

  private base(): Record<string, string> {
    return { OP_BIOMETRIC_UNLOCK_ENABLED: "false" }
  }

  private serviceSession(token: string) {
    return { env: { ...this.base(), OP_SERVICE_ACCOUNT_TOKEN: token }, method: "serviceAccount" as const }
  }

  /** A service account with a saved token is unlocked without a prompt: the token is the session. */
  async status(): Promise<LockState> {
    if (!this.session && this.method === "serviceAccount") {
      const token = (await this.tokens.get(this.id)) ?? (this.tokenEnv ? process.env[this.tokenEnv] : undefined)
      if (token) this.open(this.serviceSession(token))
    }
    return super.status()
  }

  async unlock(input: UnlockInput, signal?: AbortSignal) {
    if (input.method === "serviceAccount" && this.method === "serviceAccount") {
      const session = this.serviceSession(input.token)
      // One listing proves the token and fills the cache.
      const listed = await this.list(session.env, signal, [input.token]).catch((error) => {
        if (error instanceof LockedError) throw new Error(`${this.label}: the service account token was rejected`)
        throw error
      })
      this.cache.set("list", { at: Date.now(), items: listed })
      this.open(session)
      // A token that cannot be saved stays in memory for the session.
      await this.tokens.set(this.id, input.token)
    } else if (input.method === "masterPassword" && this.method === "masterPassword") {
      const result = await run(this.bin, ["signin", "--raw", "--account", this.address], this.base(), input.password, signal)
      if (result.code !== 0 || !result.stdout.trim()) throw new Error(`${this.label}: ${reason(result, [input.password])}`)
      const token = result.stdout.trim()
      const env = { ...this.base(), [`OP_SESSION_${this.shorthand}`]: token }
      this.cache.set("list", { at: Date.now(), items: await this.list(env, signal, [token]) })
      this.open({ env, method: "masterPassword" })
    } else throw new Error(`${this.label}: ${input.method} unlock is not supported`)
    return this.status()
  }

  async lock() {
    if (this.session?.method === "masterPassword") await run(this.bin, ["signout", "--account", this.address], this.session.env)
    await super.lock()
  }

  /** Forgets the saved token as well: the next use asks for a new one. */
  async forget() {
    await this.lock()
    await this.tokens.delete(this.id)
  }

  private async call(args: string[], env: Record<string, string>, signal?: AbortSignal, secrets: string[] = []) {
    const result = await run(this.bin, args, env, undefined, signal)
    if (result.code !== 0) {
      if (/not currently signed in|session expired|invalid service account token|authenticat/i.test(result.stderr)) {
        await super.lock()
        throw new LockedError(this.id, this.unlockMethods())
      }
      throw new Error(`${this.label}: ${reason(result, secrets)}`)
    }
    return result.stdout
  }

  private async list(env: Record<string, string>, signal?: AbortSignal, secrets: string[] = []): Promise<ItemRef[]> {
    const scopes = this.vaults.length > 0 ? this.vaults.map((vault) => ["--vault", vault]) : [[]]
    const items: ItemRef[] = []
    for (const scope of scopes) {
      const out = await this.call(["item", "list", "--categories", "Login", "--format", "json", ...scope], env, signal, secrets)
      for (const item of JSON.parse(out || "[]") as Overview[]) {
        const vault = item.vault?.id ?? item.vault?.name ?? ""
        items.push({
          account: this.id,
          id: `${vault}/${item.id}`,
          title: item.title,
          origins: (item.urls ?? []).map((url) => originOf(url.href)).filter((origin): origin is string => !!origin),
          hasOtp: true,
          fields: ["username", "password", "otp"],
        })
      }
    }
    return items
  }

  /** Where a service-account call gets its token now: this session, the keychain, then the service's environment variable. */
  private async token() {
    return this.session?.env.OP_SERVICE_ACCOUNT_TOKEN ?? (await this.tokens.get(this.id)) ?? (this.tokenEnv ? process.env[this.tokenEnv] : undefined)
  }

  /** Whether a token is saved (the keychain or the configured variable), without opening a session. */
  async hasCredential() {
    return !!(await this.token())
  }

  /**
   * Connection test: lists the vaults' logins the way a use would and reports how many, never a value. Runs with the
   * app integration off and gives up after `timeoutMs` (an app dialog never answers).
   */
  async probe(signal?: AbortSignal, timeoutMs = PROBE_MS): Promise<Probe> {
    if (this.method !== "serviceAccount") return { ok: false, code: "other", detail: "only service accounts are tested here" }
    const token = await this.token()
    if (!token) return { ok: false, code: "no_token" }
    const env = { ...this.base(), OP_SERVICE_ACCOUNT_TOKEN: token }
    const scopes = this.vaults.length > 0 ? this.vaults.map((vault) => ({ vault, args: ["--vault", vault] })) : [{ vault: undefined, args: [] as string[] }]
    const items: { id: string; title: string }[] = []
    for (const scope of scopes) {
      const result = await run(this.bin, ["item", "list", "--categories", "Login", "--format", "json", ...scope.args], env, undefined, signal, timeoutMs)
      if (result.code !== 0 || result.missing || result.timedOut) return classify(result, [token], scope.vault)
      try {
        for (const item of JSON.parse(result.stdout || "[]") as Overview[]) items.push({ id: `${item.vault?.id ?? item.vault?.name ?? ""}/${item.id}`, title: item.title })
      } catch {
        return { ok: false, code: "other", detail: "unexpected output from op item list" }
      }
    }
    return { ok: true, code: "ok", count: items.length, items: items.slice(0, 200) }
  }

  /** Reads one login's password and reports only whether it could be read. The value is dropped here. */
  async verify(itemId: string, signal?: AbortSignal, timeoutMs = PROBE_MS): Promise<Probe> {
    const token = await this.token()
    if (!token) return { ok: false, code: "no_token" }
    const [vault, id] = itemId.split("/")
    if (!vault || !id) return { ok: false, code: "other", detail: "not an item of this account" }
    const result = await run(this.bin, ["read", "--no-newline", `op://${vault}/${id}/password`], { ...this.base(), OP_SERVICE_ACCOUNT_TOKEN: token }, undefined, signal, timeoutMs)
    if (result.code !== 0 || result.missing || result.timedOut) return classify(result, [token])
    return result.stdout === "" ? { ok: false, code: "other", detail: "the login has no password" } : { ok: true, code: "ok" }
  }

  async findByOrigin(pageOrigin: string, signal?: AbortSignal) {
    const env = this.env()
    let items = this.cached("list")
    if (!items) {
      items = await this.list(env, signal)
      this.cache.set("list", { at: Date.now(), items })
    }
    return items.filter((item) => item.origins.some((origin) => originMatches(origin, pageOrigin)))
  }

  async resolve(reference: string) {
    const match = reference.match(/^op:\/\/([^/]+)\/([^/]+)\/([^?]+)(\?attribute=otp)?$/)
    if (!match) throw new Error(`${this.label}: not an op:// reference`)
    const field: FieldRef = match[4] ? "otp" : match[3] === "password" || match[3] === "username" ? match[3] : { label: match[3]! }
    return { item: { account: this.id, id: reference, title: `${match[1]}/${match[2]}`, origins: [], hasOtp: !!match[4], fields: [match[3]!] }, field }
  }

  async read(item: ItemRef, field: FieldRef, signal?: AbortSignal) {
    const env = this.env()
    if (item.id.startsWith("op://")) return this.call(["read", "--no-newline", item.id], env, signal)
    const [vault, id] = item.id.split("/") as [string, string]
    if (field === "otp") return (await this.call(["item", "get", id, "--vault", vault, "--otp"], env, signal)).trim()
    const label = typeof field === "string" ? field : field.label
    return this.call(["read", "--no-newline", `op://${vault}/${id}/${label}`], env, signal)
  }
}
