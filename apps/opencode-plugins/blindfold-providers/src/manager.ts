import { accessSync, constants } from "node:fs"
import { parseAccounts } from "./config.js"
import type { Account, LockState } from "./contract.js"
import type { KeyStore, TokenStore } from "./keychain.js"
import type { Managed } from "./managed.js"
import type { Probe } from "./probe.js"
import { run } from "./run.js"
import { accountStore, type AccountStore, type Confirmed, type Provider, type Stored } from "./store.js"
import { cleanSettings, makeId, secret } from "./validate.js"

export type Stores = { opToken: TokenStore; bw: KeyStore }

export type ManagerDeps = {
  file: string
  stores: Stores
  /** The CLI to run for each vendor when an account names none (the fixture, in tests). */
  bins?: Partial<Record<Provider, string>>
  /** Where credentials rest, as the option said (`keychain`, `memory` or a `security` path): part of what makes an account the same one. */
  where?: string
}

export type Tool = { bin: string; installed: boolean; path?: string; version?: string }

export type AccountView = {
  id: string
  provider: Provider
  label: string
  /** `config`: set in opencode.json options, shown read-only. */
  source: "stored" | "config"
  enabled: boolean
  allowedOrigins: string[]
  autoLockMinutes: number
  vaults: string[]
  organizationId?: string
  confirmEveryUse: boolean
  /** A token or API key is saved. A boolean: the credential itself never leaves the server. */
  credential: boolean
  lock: { state: "unlocked" | "locked" | "unavailable" | "disabled"; method?: string; expiresAt?: number; reason?: string }
  /** The last connection test and login check of this process. */
  test?: { at: number; probe: Probe }
  verified?: { at: number; itemId: string; probe: Probe }
  /** A stored account that could not be built: why. */
  error?: string
}

export type Overview = { accounts: AccountView[]; tools: Record<Provider, Tool>; confirmed: Confirmed; file: string }

type Live = { key: string; account: Managed; source: "stored" | "config" }

const DEFAULT_LOCK = 10
const TOOL_TTL_MS = 15_000

const toConfig = (stored: Stored, bin: string | undefined) => ({
  provider: stored.provider,
  label: stored.label,
  allowedOrigins: stored.allowedOrigins,
  autoLockMinutes: stored.autoLockMinutes,
  vaults: stored.vaults,
  organizationId: stored.organizationId,
  confirmEveryUse: stored.confirmEveryUse,
  bin,
})

/**
 * The accounts of this process, once: the ones in opencode.json (read-only, they win) and the ones the settings page saved,
 * built into live accounts that blindfold looks up on every use. A change rebuilds only the account it touched, so an
 * unlocked session of another account survives, and nothing needs a restart.
 */
export function createManager(initial: ManagerDeps) {
  // Each attach brings the options of its load; the latest wins, so an options change reloaded over a still-running
  // instance (the new setup runs before the old cleanup) is not ignored.
  const attached = new Map<symbol, { accounts: Record<string, unknown>; deps: ManagerDeps }>()
  const depsNow = () => [...attached.values()].at(-1)?.deps ?? initial
  const signature = (deps: ManagerDeps) => JSON.stringify([deps.file, deps.bins ?? null, deps.where ?? null])
  let current = accountStore(initial.file)
  const storeNow = (): AccountStore => (current.file === depsNow().file ? current : (current = accountStore(depsNow().file)))
  const store = { get file() { return storeNow().file }, read: () => storeNow().read(), write: (value: Parameters<AccountStore["write"]>[0]) => storeNow().write(value) }
  const deps = { get stores() { return depsNow().stores }, get bins() { return depsNow().bins } }
  let data = store.read()
  const live = new Map<string, Live>()
  const broken = new Map<string, string>()
  const tests = new Map<string, { at: number; probe: Probe }>()
  const checks = new Map<string, { at: number; itemId: string; probe: Probe }>()
  const listeners = new Set<() => void>()
  let tools: { at: number; value: Record<Provider, Tool> } | undefined

  const binFor = (provider: Provider) => depsNow().bins?.[provider]
  const options = () => [...attached.values()].at(-1)?.accounts ?? {}

  function reconcile() {
    const want = new Map<string, { source: "stored" | "config"; raw: Record<string, unknown> }>()
    for (const [id, raw] of Object.entries(options())) want.set(id, { source: "config", raw: raw as Record<string, unknown> })
    for (const [id, stored] of Object.entries(data.accounts)) if (!want.has(id) && stored.enabled !== false) want.set(id, { source: "stored", raw: toConfig(stored, binFor(stored.provider)) })
    broken.clear()
    const next = new Map<string, Live & { make: () => Managed }>()
    for (const [id, { source, raw }] of want) {
      try {
        const [built] = parseAccounts({ accounts: { [id]: raw } }, raw.tokenStore === undefined ? deps.stores.opToken : undefined, deps.stores.bw)
        if (built) next.set(id, { key: `${signature(depsNow())}${built.key}`, source, make: built.make as () => Managed, account: undefined as never })
      } catch (error) {
        broken.set(id, error instanceof Error ? error.message : String(error))
      }
    }
    for (const [id, entry] of live) {
      if (next.get(id)?.key === entry.key) continue
      void entry.account.lock()
      live.delete(id)
      tests.delete(id)
      checks.delete(id)
    }
    for (const [id, entry] of next) if (!live.has(id)) live.set(id, { key: entry.key, source: entry.source, account: entry.make() })
  }

  const notify = () => listeners.forEach((listener) => listener())

  function persist() {
    store.write(data)
    reconcile()
    notify()
  }

  async function checkTool(provider: Provider): Promise<Tool> {
    const bin = binFor(provider) ?? (provider === "1password" ? "op" : "bw")
    let path: string | undefined
    if (bin.includes("/")) {
      try {
        accessSync(bin, constants.X_OK)
        path = bin
      } catch {
        return { bin, installed: false }
      }
    } else {
      const found = await run("/usr/bin/which", [bin], {}, undefined, undefined, 5000)
      path = found.code === 0 ? found.stdout.trim().split("\n")[0] : undefined
      if (!path) return { bin, installed: false }
    }
    const version = await run(bin, ["--version"], {}, undefined, undefined, 5000)
    return { bin, installed: version.code === 0 || !version.missing, path, ...(version.code === 0 ? { version: version.stdout.trim().split("\n")[0]?.slice(0, 40) } : {}) }
  }

  async function checkTools(fresh = false) {
    if (!fresh && tools && Date.now() - tools.at < TOOL_TTL_MS) return tools.value
    const [onePassword, bitwarden] = await Promise.all([checkTool("1password"), checkTool("bitwarden")])
    tools = { at: Date.now(), value: { "1password": onePassword, bitwarden } }
    return tools.value
  }

  const find = (id: string) => live.get(id)

  async function view(id: string, source: "stored" | "config", settings: Stored): Promise<AccountView> {
    const entry = find(id)
    let lock: AccountView["lock"] = { state: "disabled" }
    let credential = false
    if (entry) {
      const state: LockState = await entry.account.status().catch((): LockState => ({ state: "unavailable", reason: "status failed" }))
      lock = state.state === "unlocked" ? { state: "unlocked", method: state.method, ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}) } : state.state === "locked" ? { state: "locked" } : { state: "unavailable", reason: state.reason }
      credential = await entry.account.hasCredential().catch(() => false)
    } else if (settings.enabled === false) lock = { state: "disabled" }
    else lock = { state: "unavailable", reason: broken.get(id) ?? "not loaded" }
    const info = entry?.account
    return {
      id,
      provider: settings.provider,
      label: info?.label ?? settings.label,
      source,
      enabled: settings.enabled !== false,
      allowedOrigins: [...(info?.allowedOrigins ?? settings.allowedOrigins ?? [])],
      autoLockMinutes: settings.autoLockMinutes ?? DEFAULT_LOCK,
      vaults: settings.vaults ?? [],
      ...(settings.organizationId ? { organizationId: settings.organizationId } : {}),
      confirmEveryUse: info?.confirmEveryUse ?? settings.confirmEveryUse ?? false,
      credential,
      lock,
      ...(tests.get(id) ? { test: tests.get(id)! } : {}),
      ...(checks.get(id) ? { verified: checks.get(id)! } : {}),
      ...(broken.has(id) ? { error: broken.get(id)! } : {}),
    }
  }

  /** An account seen from its configuration: what the options said, in the shape of the stored settings. */
  function fromOptions(id: string, raw: Record<string, unknown>): Stored {
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined)
    return {
      provider: raw.provider === "bitwarden" ? "bitwarden" : "1password",
      label: typeof raw.label === "string" ? raw.label : id,
      enabled: true,
      allowedOrigins: strings(raw.allowedOrigins),
      autoLockMinutes: typeof raw.autoLockMinutes === "number" ? raw.autoLockMinutes : undefined,
      vaults: strings(raw.vaults),
      organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
      confirmEveryUse: raw.confirmEveryUse === true,
    }
  }

  const known = () => new Set([...Object.keys(options()), ...Object.keys(data.accounts)])

  function editable(id: string) {
    if (id in options()) throw new Error("This account comes from opencode.json: change it there")
    const stored = data.accounts[id]
    if (!stored) throw new Error("No such account")
    return stored
  }

  async function saveSecrets(id: string, provider: Provider, secrets: unknown) {
    const given = (typeof secrets === "object" && secrets !== null ? secrets : {}) as Record<string, unknown>
    if (provider === "1password") {
      if (given.token === undefined) return false
      const token = secret(given.token, "the service account token")
      if (!(await deps.stores.opToken.set(id, token))) throw new Error("The token could not be saved to the keychain (it holds a character the keychain path cannot store)")
      return true
    }
    if (given.clientId === undefined && given.clientSecret === undefined) return false
    const clientId = secret(given.clientId, "the client id")
    const clientSecret = secret(given.clientSecret, "the client secret")
    if (!(await deps.stores.bw.set(id, { clientId, clientSecret }))) throw new Error("The API key could not be saved to the keychain")
    return true
  }

  return {
    store,
    /** The accounts from opencode.json join (the latest set wins). Throws on a bad option. Returns the detach. */
    attach(accounts: unknown, next: ManagerDeps = initial): () => void {
      if (accounts !== undefined) parseAccounts({ accounts }, next.stores.opToken, next.stores.bw)
      const token = Symbol("attached")
      attached.set(token, { accounts: (accounts ?? {}) as Record<string, unknown>, deps: next })
      data = store.read()
      reconcile()
      notify()
      return () => {
        attached.delete(token)
        if (attached.size === 0) {
          for (const entry of live.values()) void entry.account.lock()
          live.clear()
          listeners.clear()
        } else {
          reconcile()
          notify()
        }
      }
    },
    get attached() {
      return attached.size
    },
    /** What blindfold looks up on every use. */
    accounts: (): readonly Account[] => [...live.values()].map((entry) => entry.account),
    onChange(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    async overview(options: { fresh?: boolean } = {}): Promise<Overview> {
      data = store.read()
      reconcile()
      const configured = Object.entries(this.config()).map(([id, raw]) => view(id, "config", fromOptions(id, raw)))
      const stored = Object.entries(data.accounts).filter(([id]) => !(id in this.config())).map(([id, settings]) => view(id, "stored", settings))
      const [accounts, toolsNow] = await Promise.all([Promise.all([...configured, ...stored]), checkTools(options.fresh)])
      return { accounts, tools: toolsNow, confirmed: data.confirmed, file: store.file }
    },

    config: () => options() as Record<string, Record<string, unknown>>,

    async add(input: { provider: unknown; settings: unknown; secrets: unknown }): Promise<{ id: string }> {
      const provider = input.provider
      if (provider !== "1password" && provider !== "bitwarden") throw new Error("provider must be 1password or bitwarden")
      const settings = cleanSettings(input.settings, provider)
      const id = makeId(settings.label, provider, known())
      if (provider === "1password" && (typeof input.secrets !== "object" || input.secrets === null || (input.secrets as Record<string, unknown>).token === undefined)) throw new Error("the service account token is required")
      if (provider === "bitwarden" && (typeof input.secrets !== "object" || input.secrets === null || (input.secrets as Record<string, unknown>).clientSecret === undefined)) throw new Error("the API key is required")
      await saveSecrets(id, provider, input.secrets)
      try {
        data = { ...data, accounts: { ...data.accounts, [id]: { provider, ...settings, enabled: settings.enabled !== false } } }
        persist()
      } catch (error) {
        await (provider === "1password" ? deps.stores.opToken.delete(id) : deps.stores.bw.delete(id))
        throw error
      }
      return { id }
    },

    async update(input: { id: string; settings?: unknown; secrets?: unknown }) {
      const current = editable(input.id)
      const merged = cleanSettings({ ...current, ...(typeof input.settings === "object" && input.settings !== null ? input.settings : {}) }, current.provider)
      await saveSecrets(input.id, current.provider, input.secrets)
      data = { ...data, accounts: { ...data.accounts, [input.id]: { provider: current.provider, ...merged, enabled: merged.enabled !== false } } }
      tests.delete(input.id)
      checks.delete(input.id)
      persist()
    },

    async remove(id: string) {
      const current = editable(id)
      const entry = find(id)
      if (entry?.account.forget) await entry.account.forget()
      else await (current.provider === "1password" ? deps.stores.opToken.delete(id) : deps.stores.bw.delete(id))
      const { [id]: _gone, ...rest } = data.accounts
      data = { ...data, accounts: rest }
      tests.delete(id)
      checks.delete(id)
      persist()
    },

    confirm(key: keyof Confirmed, value: boolean) {
      if (key !== "opAppIntegrationOff") throw new Error("unknown step")
      data = { ...data, confirmed: { ...data.confirmed, [key]: value } }
      persist()
    },

    async lock(id: string) {
      const entry = find(id)
      if (!entry) throw new Error("No such account")
      await entry.account.lock()
      notify()
    },

    /** Bitwarden: the master password unlocks (and logs in first with the saved API key). 1Password: nothing to type. */
    async unlock(id: string, password: unknown) {
      const entry = find(id)
      if (!entry) throw new Error("No such account")
      if (entry.account.kind === "bitwarden") await entry.account.unlock({ method: "masterPassword", password: secret(password, "the master password") })
      else await entry.account.status()
      notify()
    },

    async test(id: string, timeoutMs?: number): Promise<Probe> {
      const entry = find(id)
      if (!entry) return { ok: false, code: "other", detail: "The account is disabled or not loaded" }
      const probe = await entry.account.probe(undefined, timeoutMs)
      tests.set(id, { at: Date.now(), probe })
      checks.delete(id)
      notify()
      return probe
    },

    async verify(id: string, itemId: string, timeoutMs?: number): Promise<Probe> {
      const entry = find(id)
      if (!entry?.account.verify) return { ok: false, code: "other", detail: "Not available for this account" }
      const probe = await entry.account.verify(itemId, undefined, timeoutMs)
      checks.set(id, { at: Date.now(), itemId, probe })
      notify()
      return probe
    },

    recheckTools: () => checkTools(true),
  }
}

export type Manager = ReturnType<typeof createManager>
