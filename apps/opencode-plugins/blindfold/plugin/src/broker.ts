import type { Field } from "./fields.js"
import { FLOW_PARTS, type FlowOffer, type Grants } from "./flow.js"
import { isLocked, patternMatches, type Account, type FieldRef, type ItemRef, type LockState, type UnlockMethod } from "./providers-contract.js"
import { covering, nameRule, permitted, type ConfigRule, type SavedRule } from "./rules.js"

/** One account (and item) that could serve a field. `key` identifies it inside a request. */
export type Candidate = {
  key: string
  account: string
  label: string
  state: "ready" | "locked"
  methods: UnlockMethod[]
  item?: { id: string; title: string }
  /** A saved "Always allow" rule covers it. */
  covered: boolean
  /** The account asks on every use: no "Always allow" for it. */
  confirm?: boolean
  /** Set when one Allow can cover the whole sign-in with this item (a `fill` of a login on a known tab). */
  flow?: FlowOffer
  /** This field is never remembered with Always allow (a one-time code, unless the account allows it). */
  once?: boolean
}

/** What the card needs to know about a field's provider: who could serve it, which one is chosen, or why none. */
export type Source = { state: "choose" | "unavailable"; candidates: Candidate[]; selected?: string; hint?: string }

/** A field the agent asked for, with the part of a vault item it names. */
export type Ask = { name: string; field: Field; item?: string; origin?: string; via?: "get" | "fill"; session?: string; tabID?: string }

/** `granted`: candidate key → the sign-in approval that already covers this field (a saved rule takes precedence and is not listed). */
export type Planned = { source: Source; refs: Map<string, { item: ItemRef; field: FieldRef }>; granted: Map<string, string>; itemField: string }

const PASSWORD_WORDS = new Set(["PASS", "PASSWORD", "PASSWD", "PWD", "PASSPHRASE"])
const USER_WORDS = new Set(["USER", "USERNAME", "LOGIN", "EMAIL", "MAIL"])

/** The part of an item a field name means: PASSWORD → password, EMAIL → username, an otp field → otp, else a label. */
export function itemFieldOf(ask: Pick<Ask, "name" | "item" | "field">): string {
  if (ask.item) return ask.item
  const words = ask.name.split("_").filter(Boolean)
  if (ask.field.kind === "otp") return "otp"
  if (words.some((word) => PASSWORD_WORDS.has(word))) return "password"
  if (words.some((word) => USER_WORDS.has(word))) return "username"
  return ask.name
}

const fieldRef = (key: string): FieldRef => (key === "username" || key === "password" || key === "otp" ? key : { label: key })

export type BrokerDeps = {
  accounts: () => readonly Account[]
  rules: readonly ConfigRule[]
  saved: () => Promise<SavedRule[]>
  /** The sign-in approvals in memory; absent in tests that do not use them. */
  grants?: Pick<Grants, "peek" | "ttl">
}

/**
 * Which accounts can serve each field, with nothing read: only references (titles and ids) are looked at. A field with no
 * provider at all is simply absent from the plan and is typed in the card, as before providers existed.
 */
export function createBroker(deps: BrokerDeps) {
  async function planOne(ask: Ask, accounts: readonly Account[], saved: SavedRule[], status: (account: Account) => Promise<LockState>): Promise<Planned | undefined> {
    const itemField = itemFieldOf(ask)
    const rule = nameRule(ask.name, deps.rules)
    let tries: { account: Account; ref?: string }[]
    if (rule?.ref) tries = rule.account.flatMap((id) => accounts.filter((account) => account.id === id).map((account) => ({ account, ref: rule.ref })))
    else if (ask.origin) tries = permitted(ask.origin, accounts, deps.rules).flatMap((info) => accounts.filter((account) => account.id === info.id).map((account) => ({ account })))
    else return undefined
    if (accounts.length === 0) return undefined

    let candidates: Candidate[] = []
    const refs = new Map<string, { item: ItemRef; field: FieldRef }>()
    const granted = new Map<string, string>()
    const hints: string[] = []
    let searched = false
    const add = (account: Account, state: "ready" | "locked", methods: UnlockMethod[], found?: { item: ItemRef; field: FieldRef }) => {
      const key = found ? `${account.id}:${found.item.id}` : account.id
      const use = { account: account.id, field: itemField, item: found?.item.id, origin: rule?.ref ? undefined : ask.origin, name: ask.name, via: ask.via }
      const usable = state === "ready" && !account.confirmEveryUse
      const byRule = usable && covering(saved, use) !== undefined
      // A sign-in is only for a fill of a login on a known tab; a name rule and a get never use one.
      const flowable = usable && found !== undefined && ask.via === "fill" && ask.origin !== undefined && !rule?.ref && ask.session !== undefined && ask.tabID !== undefined
      const grant = flowable && !byRule ? deps.grants?.peek({ session: ask.session!, tabID: ask.tabID!, origin: ask.origin!, account: account.id, item: found!.item.id, part: itemField }) : undefined
      const covered = byRule || grant !== undefined
      const parts = flowable && !covered ? FLOW_PARTS.filter((part) => found!.item.fields.includes(part) && covering(saved, { ...use, field: part }) === undefined) : []
      const flow: FlowOffer | undefined = parts.length >= 2 && parts.includes(itemField as never) ? { parts, always: parts.filter((part) => part !== "otp" || account.alwaysAllowOtp === true), minutes: deps.grants ? deps.grants.ttl / 60_000 : 0 } : undefined
      const once = itemField === "otp" && !account.alwaysAllowOtp
      candidates.push({ key, account: account.id, label: account.label, state, methods, ...(account.confirmEveryUse ? { confirm: true } : {}), ...(found ? { item: { id: found.item.id, title: found.item.title } } : {}), covered, ...(flow ? { flow } : {}), ...(once ? { once: true } : {}) })
      if (found) refs.set(key, found)
      if (grant) granted.set(key, grant.id)
    }
    for (const { account, ref } of tries) {
      const state = await status(account)
      if (state.state === "unavailable") {
        hints.push(`${account.label}: ${state.reason}`)
        continue
      }
      try {
        if (ref) {
          const found = await account.resolve(ref)
          add(account, state.state === "locked" ? "locked" : "ready", state.state === "locked" ? [...state.methods] : [], found)
        } else if (state.state === "locked") add(account, "locked", [...state.methods])
        else {
          const items = await account.findByOrigin(ask.origin!)
          searched = true
          const holding = items.filter((item) => item.fields.includes(itemField))
          if (items.length > 0 && holding.length === 0) hints.push(`${account.label}: the login has no ${itemField}`)
          for (const item of holding) add(account, "ready", [], { item, field: fieldRef(itemField) })
        }
      } catch (error) {
        // The session ended between the status and the listing.
        if (isLocked(error)) add(account, "locked", [...error.methods])
        else hints.push(error instanceof Error ? error.message : String(error))
      }
    }
    // A locked account cannot be searched. It is listed only when nothing unlocked can serve the field, or when a rule names
    // it for this site; otherwise every locked vault would show up as a choice on every page.
    const named = new Set(ask.origin ? deps.rules.filter((item) => item.origin !== undefined && patternMatches(item.origin, ask.origin!)).flatMap((item) => item.account) : [])
    const skipped = candidates.filter((item) => item.state === "locked" && !named.has(item.account))
    if (searched || candidates.some((item) => item.state === "ready")) candidates = candidates.filter((item) => item.state === "ready" || named.has(item.account))
    if (candidates.length === 0) {
      const locked = skipped.length > 0 ? ` Not searched, locked: ${skipped.map((item) => item.label).join(", ")}.` : ""
      return { itemField, refs, granted, source: { state: "unavailable", candidates: [], hint: (hints[0] ?? "No login for this site in your vaults.") + locked } }
    }
    const chosen = candidates.find((item) => item.covered) ?? (candidates.length === 1 ? candidates[0] : undefined)
    return { itemField, refs, granted, source: { state: "choose", candidates, ...(chosen ? { selected: chosen.key } : {}) } }
  }

  return {
    async plan(asks: readonly Ask[]): Promise<Map<string, Planned>> {
      const accounts = deps.accounts()
      const saved = await deps.saved()
      const states = new Map<string, Promise<LockState>>()
      const status = (account: Account) => {
        const known = states.get(account.id) ?? account.status()
        states.set(account.id, known)
        return known
      }
      const plans = new Map<string, Planned>()
      for (const ask of asks) {
        const planned = await planOne(ask, accounts, saved, status)
        if (planned) plans.set(ask.name, planned)
      }
      return plans
    },

    /** Every provider field has one chosen, ready, covered candidate: nothing for the user to decide. */
    silent(asks: readonly Ask[], plans: ReadonlyMap<string, Planned>) {
      const provider = asks.filter((ask) => plans.get(ask.name)?.source.state === "choose")
      if (provider.length !== asks.length) return false
      return provider.every((ask) => {
        const source = plans.get(ask.name)!.source
        const picked = source.candidates.find((item) => item.key === source.selected)
        return picked !== undefined && picked.state === "ready" && picked.covered
      })
    },

    /** Reads the value of one planned field from the chosen candidate. Throws LockedError if the session ended. */
    async read(planned: Planned, key: string, signal?: AbortSignal) {
      const found = planned.refs.get(key)
      const candidate = planned.source.candidates.find((item) => item.key === key)
      const account = deps.accounts().find((item) => item.id === candidate?.account)
      if (!found || !candidate || !account) throw new Error("That account is no longer available.")
      return { value: await account.read(found.item, found.field, signal), account, candidate }
    },
  }
}

export type Broker = ReturnType<typeof createBroker>
