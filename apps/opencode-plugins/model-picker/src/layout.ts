// Pure ordering of the model picker. The host builds Favorites, Recent and one section per provider, and moves every
// favorite and recent model out of its provider. This module takes the models the host lists, in the host's own
// sections, and returns the sections the picker shows: Favorites as the host lists them, then one section per provider.

export interface HostModel {
  /** `providerID:modelID`, the host row's `data-option-key`. */
  key: string
  name: string
  /** The host section the row sits in: "favorite", "recent", or the provider id. */
  section: string
}

export interface Section {
  /** "favorite" or the provider id. */
  id: string
  keys: string[]
}

export interface LayoutInput {
  models: readonly HostModel[]
  /** USD per million output tokens by model key; a missing model costs 0. */
  price: ReadonlyMap<string, number>
  /** Provider display name by provider id. */
  providerName(id: string): string
}

export const providerOf = (key: string) => key.slice(0, key.indexOf(":"))

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0)

export function layout(input: LayoutInput): Section[] {
  const favorite = input.models.filter((model) => model.section === "favorite")
  const byProvider = new Map<string, HostModel[]>()
  for (const model of input.models) {
    if (model.section === "favorite") continue
    const id = providerOf(model.key)
    byProvider.set(id, [...(byProvider.get(id) ?? []), model])
  }
  const price = (model: HostModel) => input.price.get(model.key) ?? 0
  const providers = [...byProvider.keys()].sort((a, b) => compare(input.providerName(a), input.providerName(b)) || compare(a, b))
  return [
    ...(favorite.length > 0 ? [{ id: "favorite", keys: favorite.map((model) => model.key) }] : []),
    ...providers.map((id) => ({
      id,
      keys: [...byProvider.get(id)!]
        .sort((a, b) => price(b) - price(a) || compare(a.name, b.name) || compare(a.key, b.key))
        .map((model) => model.key),
    })),
  ]
}

/** The key one arrow press away in `order`, wrapping at both ends; the first (or last) when nothing is active. */
export function step(order: readonly string[], active: string | undefined, delta: 1 | -1): string | undefined {
  if (order.length === 0) return undefined
  const at = active === undefined ? -1 : order.indexOf(active)
  if (at === -1) return delta > 0 ? order[0] : order[order.length - 1]
  return order[(at + delta + order.length) % order.length]
}

/** Presses of the host's ArrowDown that move its highlight from `from` to `to` in the host's own order: the shorter way round. */
export function presses(hostOrder: readonly string[], from: string | undefined, to: string): { key: "ArrowDown" | "ArrowUp"; count: number } {
  const n = hostOrder.length
  const target = hostOrder.indexOf(to)
  const start = from === undefined || hostOrder.indexOf(from) === -1 ? 0 : hostOrder.indexOf(from)
  if (target === -1 || n === 0) return { key: "ArrowDown", count: 0 }
  const down = (target - start + n) % n
  return down <= n - down ? { key: "ArrowDown", count: down } : { key: "ArrowUp", count: n - down }
}

/** The output price of a model: the base tier when there is one, else the first. */
export function outputPrice(cost: ReadonlyArray<{ tier?: unknown; output: number }> | undefined): number {
  if (!cost || cost.length === 0) return 0
  const base = cost.find((entry) => entry.tier === undefined) ?? cost[0]!
  return Number.isFinite(base.output) ? base.output : 0
}
