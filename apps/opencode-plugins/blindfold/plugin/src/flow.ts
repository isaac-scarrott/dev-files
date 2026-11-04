import { randomUUID } from "node:crypto"
import type { Candidate, Source } from "./broker.js"

/** The parts of a login item a sign-in can cover. Anything else (a labelled field) always asks on its own. */
export const FLOW_PARTS = ["username", "password", "otp"] as const

export const DEFAULT_FLOW_MINUTES = 3
export const MAX_FLOW_MINUTES = 10

/** What a card offers when the user may approve the whole sign-in: the parts one Allow covers, and the ones Always allow saves. */
export type FlowOffer = { parts: string[]; always: string[]; minutes: number }

/** A field of a vault item, named by the part it means, in one session, tab and origin. */
export type GrantUse = { session: string; tabID: string; origin: string; account: string; item: string; part: string }

/**
 * An in-memory approval of a sign-in. Never written anywhere. It lets later `fill` requests of the same session, tab and
 * origin for the same item and a listed part go through without a card, each part once.
 */
export type Grant = {
  id: string
  session: string
  tabID: string
  origin: string
  account: string
  item: string
  parts: ReadonlySet<string>
  used: Set<string>
  expiresAt: number
  /** The card that created it; its answered row counts the uses. */
  requestID?: string
}

export type NewGrant = Omit<Grant, "id" | "expiresAt" | "used" | "parts"> & { parts: Iterable<string>; used?: Iterable<string> }

export function createGrants(options: { now?: () => number; minutes?: number } = {}) {
  const now = options.now ?? Date.now
  const ttl = Math.round((options.minutes ?? DEFAULT_FLOW_MINUTES) * 60_000)
  const grants = new Map<string, Grant>()
  const sweep = () => {
    for (const [id, grant] of grants) if (grant.expiresAt <= now()) grants.delete(id)
  }
  const matching = (use: GrantUse) => {
    sweep()
    for (const grant of grants.values()) {
      if (grant.session !== use.session || grant.tabID !== use.tabID || grant.origin !== use.origin) continue
      if (grant.account !== use.account || grant.item !== use.item) continue
      if (!grant.parts.has(use.part) || grant.used.has(use.part)) continue
      return grant
    }
    return undefined
  }
  return {
    ttl,
    create(input: NewGrant): Grant {
      sweep()
      const grant: Grant = { ...input, id: randomUUID(), parts: new Set(input.parts), used: new Set(input.used ?? []), expiresAt: now() + ttl }
      grants.set(grant.id, grant)
      return grant
    },
    /** The grant that would cover this use, without spending it. */
    peek: (use: GrantUse) => matching(use),
    /** Spends the part: synchronous, so two requests cannot both get it. */
    take(use: GrantUse): Grant | undefined {
      const grant = matching(use)
      grant?.used.add(use.part)
      return grant
    },
    /** Gives a spent part back, for a request that was spent on but then failed before the value was used. */
    release(grantID: string, part: string) {
      grants.get(grantID)?.used.delete(part)
    },
    /** The tab was closed or went somewhere unknown. No tab named: every tab's. */
    revokeTab(tabID?: string) {
      for (const [id, grant] of grants) if (tabID === undefined || grant.tabID === tabID) grants.delete(id)
    },
    /** The tab navigated: grants for any other origin end. An unknown origin ends them all. No tab named: every tab's. */
    revokeOffOrigin(tabID: string | undefined, origin: string | undefined) {
      for (const [id, grant] of grants) if ((tabID === undefined || grant.tabID === tabID) && grant.origin !== origin) grants.delete(id)
    },
    clear: () => grants.clear(),
    get size() {
      sweep()
      return grants.size
    },
    list: () => {
      sweep()
      return [...grants.values()]
    },
  }
}

export type Grants = ReturnType<typeof createGrants>

/**
 * The sign-in the user may approve in one go: every provider field of the request chooses the same candidate, and that
 * candidate offers one. Used by the card (what to show) and by the server (what to believe on submit); the server never
 * trusts the card's word for it.
 */
export function flowOf(fields: readonly { name: string; source?: Source }[], keyOf: (field: { name: string; source?: Source }) => string | undefined) {
  const providers = fields.filter((field) => field.source?.state === "choose")
  if (providers.length === 0) return undefined
  let found: { candidate: Candidate; flow: FlowOffer } | undefined
  for (const field of providers) {
    const key = keyOf(field) ?? field.source!.selected
    const candidate = field.source!.candidates.find((item) => item.key === key)
    if (!candidate?.flow || candidate.state !== "ready") return undefined
    if (found && (found.candidate.key !== candidate.key || found.flow.parts.join() !== candidate.flow.parts.join())) return undefined
    found ??= { candidate, flow: candidate.flow }
  }
  return found
}

/** Reads the `flowMinutes` option: a number from a little over 0 to 10. */
export function parseFlowMinutes(value: unknown): number {
  if (value === undefined) return DEFAULT_FLOW_MINUTES
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_FLOW_MINUTES) {
    throw new Error(`opencode-blindfold flowMinutes option must be a number above 0 and at most ${MAX_FLOW_MINUTES}`)
  }
  return value
}
