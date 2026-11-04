import type { Provider, Stored } from "./store.js"

const fail = (message: string): never => {
  throw new Error(message)
}

const ORIGIN = /^(https?:\/\/)?(\*\.)?[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?\/?$/i
const ID_LIKE = /^[A-Za-z0-9._-]{1,64}$/

function text(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || value.trim() === "") return fail(`${name} is required`)
  if (value.length > max) return fail(`${name} is too long`)
  return value.trim()
}

function list(value: unknown, name: string, check: (item: string) => boolean, what: string) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return fail(`${name} must be a list`)
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "")
  for (const item of items) if (!check(item)) fail(`${what}: ${item.slice(0, 60)}`)
  return items.length > 0 ? [...new Set(items)] : undefined
}

/** The settings of an account from what the page sent. Throws a message safe to show. Secrets are not read here. */
export function cleanSettings(input: unknown, provider: Provider): Omit<Stored, "provider" | "enabled"> & { enabled?: boolean } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("settings must be an object")
  const draft = input as Record<string, unknown>
  const minutes = draft.autoLockMinutes
  if (minutes !== undefined && (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440)) fail("auto-lock must be between 1 and 1440 minutes")
  const organizationId = draft.organizationId === undefined || draft.organizationId === "" ? undefined : text(draft.organizationId, "organisation id", 64)
  if (organizationId !== undefined && !ID_LIKE.test(organizationId)) fail("the organisation id has characters it should not")
  return {
    label: text(draft.label, "name", 60),
    allowedOrigins: list(draft.allowedOrigins, "allowed sites", (item) => ORIGIN.test(item), "not a site"),
    autoLockMinutes: minutes as number | undefined,
    vaults: provider === "1password" ? list(draft.vaults, "vaults", (item) => item.length <= 100 && !/[\n\r]/.test(item), "not a vault name") : undefined,
    organizationId: provider === "bitwarden" ? organizationId : undefined,
    confirmEveryUse: draft.confirmEveryUse === undefined ? undefined : draft.confirmEveryUse === true,
    enabled: draft.enabled === undefined ? undefined : draft.enabled === true,
  }
}

/** A credential for the keychain: a non-empty single line. */
export function secret(value: unknown, name: string) {
  if (typeof value !== "string" || value === "") return fail(`${name} is required`)
  if (value.length > 4096 || /[\r\n]/.test(value)) return fail(`${name} is not a single line`)
  return value.trim()
}

/** An account id from its name: lowercase letters, digits, - and _, starting with a letter, unique among `taken`. */
export function makeId(label: string, provider: Provider, taken: ReadonlySet<string>) {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
  if (!/^[a-z]/.test(base)) base = `${provider === "1password" ? "op" : "bw"}-${base}`.replace(/-$/, "")
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}
