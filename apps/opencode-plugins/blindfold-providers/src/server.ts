import { Plugin } from "@opencode/plugin"
import { parseAccounts } from "./config.js"
import { registerProvider, PROVIDERS_PROTOCOL, type Account } from "./contract.js"

const POOL = Symbol.for("opencode-plugins.blindfold.providers.pool.v1")

type Entry = { key: string; account: Account; users: number }

/**
 * Accounts and their sessions live here, once per process, not once per location: the server plugin runs for every project,
 * and unlocking Work once must serve all of them. Held on globalThis (like the registry) so it survives a module reload.
 */
function pool() {
  const holder = globalThis as unknown as Record<symbol, Map<string, Entry> | undefined>
  return (holder[POOL] ??= new Map())
}

/** Takes the account for this configuration, or the one already unlocked with the same configuration. */
function lease(id: string, key: string, make: () => Account) {
  const entries = pool()
  let entry = entries.get(id)
  if (entry && entry.key !== key) {
    void entry.account.lock()
    entry = undefined
  }
  if (!entry) entries.set(id, (entry = { key, account: make(), users: 0 }))
  entry.users++
  const leased = entry
  return {
    account: leased.account,
    release: () => {
      if (--leased.users > 0) return
      if (entries.get(id) === leased) entries.delete(id)
      void leased.account.lock()
    },
  }
}

export default Plugin.define({
  id: "blindfold-providers",
  async setup(ctx) {
    const built = parseAccounts(ctx.options)
    const leases = built.map((item) => lease(item.id, item.key, item.make))
    const kinds = [...new Set(leases.map((item) => item.account.kind))]
    const unregister = kinds.map((kind) =>
      registerProvider({
        kind,
        accepts: [PROVIDERS_PROTOCOL],
        source: "blindfold-providers",
        accounts: () => leases.map((item) => item.account).filter((account) => account.kind === kind),
      }),
    )
    return () => {
      for (const stop of unregister) stop()
      for (const item of leases) item.release()
    }
  },
})
