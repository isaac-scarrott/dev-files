import { patternMatches, type AccountInfo } from "./providers-contract.js"

/** A rule from the options: which accounts may serve a secret name, or an origin. */
export type ConfigRule = { name?: string; origin?: string; account: readonly string[]; ref?: string }

/** A rule the user saved with "Always allow": this origin (or name), this account, this item field. Never a value. */
export type SavedRule = {
  id: string
  /** The page origin it applies to (`https://accounts.google.com`), or absent for a name rule. */
  origin?: string
  /** The secret name it applies to, for a rule that is not about a page. */
  name?: string
  account: string
  /** The item it was saved for; a rule for another item of the same account does not cover. */
  item?: string
  itemTitle?: string
  /** The item field: `username`, `password`, `otp` or a label. */
  field: string
  /**
   * What it was saved for. A `fill` rule lets the value go to a page only; a `get` rule (or none) also lets it go to the
   * agent's code, so it covers a fill as well, never the other way round.
   */
  via?: "get" | "fill"
  /**
   * `flow`: one rule for a whole sign-in on `origin` with `item`, covering the `parts` (username, password, and a one-time
   * code only where the account allows it). Fill only. Absent or `field`: the rule covers the one `field`.
   */
  kind?: "field" | "flow"
  parts?: string[]
  created: number
}

const NAME = /^[A-Z_][A-Z0-9_]*$/

/** Reads the `rules` option. Throws a message that names the rule. */
export function parseRules(value: unknown): ConfigRule[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("opencode-blindfold rules option must be a list")
  return value.map((entry, index) => {
    const where = `opencode-blindfold rules[${index}]`
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error(`${where} must be an object`)
    const rule = entry as Record<string, unknown>
    if (rule.tag !== undefined) throw new Error(`${where}: tag rules are not supported (Bitwarden has no tags); use name or origin`)
    const { name, origin, account, ref } = rule
    if ((name === undefined) === (origin === undefined)) throw new Error(`${where} needs exactly one of name or origin`)
    if (name !== undefined && (typeof name !== "string" || !NAME.test(name))) throw new Error(`${where}.name must match ${NAME.source}`)
    if (origin !== undefined && (typeof origin !== "string" || origin.trim() === "")) throw new Error(`${where}.origin must be a host pattern such as *.example.com`)
    const accounts = typeof account === "string" ? [account] : account
    if (!Array.isArray(accounts) || accounts.length === 0 || accounts.some((item) => typeof item !== "string" || item === "")) throw new Error(`${where}.account must be an account id or a list of them`)
    if (ref !== undefined && (typeof ref !== "string" || ref === "")) throw new Error(`${where}.ref must be a non-empty string`)
    if (ref !== undefined && name === undefined) throw new Error(`${where}.ref only applies to a name rule`)
    return { name: name as string | undefined, origin: origin as string | undefined, account: accounts as string[], ref: ref as string | undefined }
  })
}

/**
 * The accounts that may serve a page. An account with `allowedOrigins` is fenced: it serves only those origins. When a rule
 * names the origin, only the accounts it names serve it; otherwise every account that is not fenced out does.
 */
export function permitted(origin: string, accounts: readonly AccountInfo[], rules: readonly ConfigRule[]): AccountInfo[] {
  const fence = (account: AccountInfo) => !account.allowedOrigins || account.allowedOrigins.some((pattern) => patternMatches(pattern, origin))
  const named = rules.filter((rule) => rule.origin !== undefined && patternMatches(rule.origin, origin)).flatMap((rule) => rule.account)
  return accounts.filter((account) => fence(account) && (named.length === 0 || named.includes(account.id)))
}

/** The rule from the options for a secret name, if any. */
export const nameRule = (name: string, rules: readonly ConfigRule[]) => rules.find((rule) => rule.name === name)

export type Use = { account: string; field: string; item?: string; origin?: string; name?: string; via?: "get" | "fill" }

/** A saved rule that covers this use, or undefined. An origin use needs the same origin; a name use the same name. */
export function covering(saved: readonly SavedRule[], use: Use): SavedRule | undefined {
  return saved.find((rule) => {
    if (rule.kind === "flow") return rule.account === use.account && use.via === "fill" && rule.item === use.item && use.origin !== undefined && rule.origin === use.origin && rule.parts?.includes(use.field) === true
    if (rule.account !== use.account || rule.field !== use.field) return false
    if (rule.via === "fill" && use.via !== "fill") return false
    if (rule.item !== undefined && rule.item !== use.item) return false
    if (use.origin !== undefined) return rule.origin === use.origin
    return rule.name !== undefined && rule.name === use.name
  })
}

const V1 = "rules.v1"
const V2 = "rules.v2"

/**
 * The stored rules of any version as the current list. Version 1 was a bare array of per-field rules; version 2 is
 * `{ version: 2, rules }` and adds sign-in rules. A v1 rule stays exactly what it was (a field rule).
 */
export function migrateRules(value: unknown): SavedRule[] {
  const list = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { rules?: unknown }).rules) ? (value as { rules: unknown[] }).rules : []
  return list.filter((rule): rule is SavedRule => !!rule && typeof rule === "object" && typeof (rule as SavedRule).id === "string" && typeof (rule as SavedRule).account === "string").map((rule) => ({ ...rule, kind: rule.kind ?? "field" }))
}

/** The saved rules, kept in the plugin's storage. Only ids, origins, account ids and field names are written. */
export function savedRules(store: { get(key: string): Promise<unknown>; set(key: string, value: any): Promise<void> }, id: () => string, now: () => number = Date.now) {
  // v2 wins when present; otherwise the v1 array is read as is and v2 is written on the first change. v1 is left untouched.
  const load = async (): Promise<SavedRule[]> => migrateRules((await store.get(V2)) ?? (await store.get(V1)))
  const write = (rules: SavedRule[]) => store.set(V2, { version: 2, rules })
  return {
    list: load,
    /** Saves a rule unless an equal one exists. */
    async add(use: Use & { itemTitle?: string }): Promise<SavedRule> {
      const rules = await load()
      const same = covering(rules, use)
      if (same && same.item === use.item && (same.via ?? "get") === (use.via ?? "get")) return same
      const rule: SavedRule = { id: id(), origin: use.origin, name: use.origin === undefined ? use.name : undefined, account: use.account, item: use.item, itemTitle: use.itemTitle, field: use.field, via: use.via, kind: "field", created: now() }
      await write([...rules, rule])
      return rule
    },
    /** Saves the one rule for a sign-in; an existing one for the same account, item and site takes the new parts. */
    async addFlow(input: { account: string; item: string; itemTitle?: string; origin: string; parts: string[] }): Promise<SavedRule> {
      const rules = await load()
      const same = rules.find((rule) => rule.kind === "flow" && rule.account === input.account && rule.item === input.item && rule.origin === input.origin)
      if (same) {
        const parts = [...new Set([...(same.parts ?? []), ...input.parts])]
        if (parts.length === same.parts?.length) return same
        const next = { ...same, parts }
        await write(rules.map((rule) => (rule === same ? next : rule)))
        return next
      }
      const rule: SavedRule = { id: id(), origin: input.origin, account: input.account, item: input.item, itemTitle: input.itemTitle, field: "sign-in", via: "fill", kind: "flow", parts: [...new Set(input.parts)], created: now() }
      await write([...rules, rule])
      return rule
    },
    async revoke(ruleID: string): Promise<boolean> {
      const rules = await load()
      const next = rules.filter((rule) => rule.id !== ruleID)
      if (next.length === rules.length) return false
      await write(next)
      return true
    },
  }
}
