// The provider contract between blindfold (the consumer: card, redaction, fill) and provider plugins (1Password,
// Bitwarden, ...). Spike draft: this file is what a provider bundle and blindfold would both include, as native-ui's
// notify-contract.ts is. No imports, so it is valid in a server half and a GUI half.
//
// The registry lives on globalThis under a versioned Symbol.for key. Both halves look it up on every call, so a provider
// plugin that reloads (or loads after blindfold, or not at all) leaves nothing stale behind.

export const PROVIDERS_PROTOCOL = 1
export const PROVIDERS_KEY = Symbol.for(`opencode-plugins.blindfold.providers.v${PROVIDERS_PROTOCOL}`)

/** How an account is unlocked. None of these needs biometrics. */
export type UnlockMethod =
  /** The vendor desktop app approves each process (1Password app integration, 1Password SDK desktop auth). Optional. */
  | "app"
  /** A master password typed into blindfold's card, passed to the CLI on stdin; the session it yields lives in memory. */
  | "masterPassword"
  /** A scoped machine token (1Password service account). No prompt; the token itself comes from the keychain or the card. */
  | "serviceAccount"
  /** Bitwarden personal API key to log in, then masterPassword to unlock. */
  | "apiKey"

export interface Capabilities {
  /** Current TOTP code for an item. */
  readonly otp: boolean
  /** Items can be listed with their URLs, so origin matching is possible. */
  readonly searchByOrigin: boolean
  /** Can create or update an item (save a new password). v1: false everywhere. */
  readonly write: boolean
  /** Can complete a WebAuthn ceremony. No CLI offers this (see DESIGN §1 O13, B10): false. */
  readonly passkey: boolean
  /** Unlock methods this backend supports, in the order it prefers them. */
  readonly unlock: readonly UnlockMethod[]
}

/** What an account says about itself. Never a value, never a session token. */
export interface AccountInfo {
  /** Config id, e.g. "work", "personal". Unique across providers. */
  readonly id: string
  /** Shown to the user: "Work (Bitwarden)". */
  readonly label: string
  /** "1password" | "bitwarden" | ... */
  readonly kind: string
  readonly capabilities: Capabilities
}

export type LockState =
  | { readonly state: "unlocked"; readonly method: UnlockMethod; readonly expiresAt?: number }
  | { readonly state: "locked"; readonly methods: readonly UnlockMethod[] }
  /** CLI missing, not logged in, no network: the card says why and falls back to typing. */
  | { readonly state: "unavailable"; readonly reason: string }

/** An item reference that is safe to show and log: ids and titles, no field values. */
export interface ItemRef {
  readonly account: string
  readonly id: string
  readonly title: string
  /** Origins the item is saved for (normalised scheme://host[:port]). */
  readonly origins: readonly string[]
  readonly hasOtp: boolean
  /** Field names the item has a value for: "username", "password", "otp", or a custom label. */
  readonly fields: readonly string[]
}

/** Which value of an item. `otp` is computed at read time. */
export type FieldRef = "username" | "password" | "otp" | { readonly label: string }

/** The credentials an unlock needs, collected by blindfold's card (masked inputs) and handed straight over. */
export type UnlockInput =
  | { readonly method: "masterPassword"; readonly password: string }
  | { readonly method: "serviceAccount"; readonly token: string }
  | { readonly method: "apiKey"; readonly clientId: string; readonly clientSecret: string; readonly password: string }
  | { readonly method: "app" }

export interface Account extends AccountInfo {
  status(): Promise<LockState>
  /** Throws `LockedError` if the account must be unlocked first. */
  unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>
  /** Drops the in-memory session now (auto-lock, user "Lock", plugin dispose). */
  lock(): Promise<void>
  /** Items whose saved URLs match the origin (registrable-domain or exact, per item), without values. */
  findByOrigin(origin: string, signal?: AbortSignal): Promise<readonly ItemRef[]>
  /** Resolves a configured reference ("op://Agent/GitHub/password", "bw:<id>/password") to an item. */
  resolve(reference: string, signal?: AbortSignal): Promise<{ item: ItemRef; field: FieldRef }>
  /** The value. Only blindfold calls this, only after the user's approval and the policy allowed it. */
  read(item: ItemRef, field: FieldRef, signal?: AbortSignal): Promise<string>
}

export class LockedError extends Error {
  readonly account: string
  readonly methods: readonly UnlockMethod[]
  constructor(account: string, methods: readonly UnlockMethod[]) {
    super(`${account} is locked`)
    this.account = account
    this.methods = methods
  }
}

export interface Provider {
  /** "1password" | "bitwarden". */
  readonly kind: string
  /** Protocol majors this provider speaks. */
  readonly accepts: readonly number[]
  /** The provider plugin's own id, so blindfold can say who registered what. */
  readonly source: string
  accounts(): readonly Account[]
}

interface Registry {
  readonly v: number
  readonly providers: Map<string, Provider>
}

const holder = () => globalThis as unknown as Record<symbol, Registry | undefined>

/** A provider plugin calls this in setup and the returned function in its dispose. */
export function registerProvider(provider: Provider): () => void {
  const registry = (holder()[PROVIDERS_KEY] ??= { v: PROVIDERS_PROTOCOL, providers: new Map() })
  registry.providers.set(provider.kind, provider)
  return () => {
    if (registry.providers.get(provider.kind) === provider) registry.providers.delete(provider.kind)
  }
}

/** Blindfold calls this on every use: every account of every live provider. */
export function accounts(): readonly Account[] {
  const registry = holder()[PROVIDERS_KEY]
  if (!registry) return []
  return [...registry.providers.values()].filter((p) => p.accepts.includes(PROVIDERS_PROTOCOL)).flatMap((p) => p.accounts())
}

// ---- Mapping (lives in blindfold's options; evaluated by blindfold, not by providers) ----

/**
 * One rule per line of config. First match by specificity: an exact secret name beats an origin pattern beats a tag.
 *   { name: "GITHUB_TOKEN", account: "personal", ref: "op://Agent/GitHub/token" }
 *   { origin: "*.holibob.tech", account: "work" }
 *   { origin: "accounts.google.com", account: ["personal", "work"] }   // both may hold Google logins: ask, remember
 */
export interface Rule {
  readonly name?: string
  readonly origin?: string
  readonly tag?: string
  readonly account: string | readonly string[]
  readonly ref?: string
}

export interface AccountPolicy {
  /** Minutes an unlocked session stays in memory without use. Default 10. Never written to disk. */
  readonly autoLockMinutes?: number
  /** Every read needs a click in the card, even when the mapping is exact. Default true. */
  readonly confirmEveryUse?: boolean
  /** Origins this account may fill. Default: the item's own saved URLs only. */
  readonly allowedOrigins?: readonly string[]
  /** Minutes blindfold keeps a value it read (for redaction and reuse). Default 0 = read on each use. */
  readonly cacheMinutes?: number
}
