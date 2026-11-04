import { Plugin } from "@opencode/plugin"
import { registerProvider, PROVIDERS_PROTOCOL } from "./contract.js"
import { keychainStores } from "./keychain.js"
import { createManager, type Manager } from "./manager.js"
import { Providers } from "./rpc.js"
import { defaultStoreFile, type Provider } from "./store.js"

const SHARED = Symbol.for("opencode-plugins.blindfold.providers.manager.v1")

type Shared = { manager: Manager; users: number; unregister: (() => void)[] }

/**
 * The manager lives once per process, not once per location: the server plugin runs for every project, and unlocking Work
 * once must serve all of them. Held on globalThis (like the registry) so it survives a module reload.
 */
function shared(options: Record<string, unknown>): Shared {
  const holder = globalThis as unknown as Record<symbol, Shared | undefined>
  const existing = holder[SHARED]
  if (existing) return existing
  const bins = typeof options.bins === "object" && options.bins !== null ? (options.bins as Partial<Record<Provider, string>>) : undefined
  const manager = createManager({
    file: typeof options.accountsFile === "string" ? options.accountsFile : defaultStoreFile(),
    stores: keychainStores(typeof options.tokenStore === "string" ? options.tokenStore : "keychain"),
    bins,
  })
  const kinds: Provider[] = ["1password", "bitwarden"]
  // Both vendors are registered for as long as the plugin runs: the accounts are read lazily, so one added or removed on
  // the settings page is seen by the next use with no re-registration.
  const unregister = kinds.map((kind) => registerProvider({ kind, accepts: [PROVIDERS_PROTOCOL], source: "blindfold-providers", accounts: () => manager.accounts().filter((account) => account.kind === kind) }))
  return (holder[SHARED] = { manager, users: 0, unregister })
}

const failure = (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "failed" })

export default Plugin.define({
  id: "blindfold-providers",
  async setup(ctx) {
    const state = shared(ctx.options)
    const { manager } = state
    let detach: () => void
    try {
      detach = manager.attach(ctx.options.accounts)
    } catch (error) {
      if (state.users === 0) {
        state.unregister.forEach((stop) => stop())
        delete (globalThis as unknown as Record<symbol, Shared | undefined>)[SHARED]
      }
      throw error
    }
    state.users++

    const rpc = await ctx.rpc?.register(Providers, {
      overview: async (input) => (await manager.overview({ fresh: (input as { fresh?: boolean }).fresh === true })) as never,
      add: async (input) => {
        try {
          return { ok: true, ...(await manager.add(input as never)) }
        } catch (error) {
          return failure(error)
        }
      },
      update: async (input) => manager.update(input as never).then(() => ({ ok: true }), failure),
      remove: async (input) => manager.remove((input as { id: string }).id).then(() => ({ ok: true }), failure),
      confirm: async (input) => {
        try {
          manager.confirm((input as { key: "opAppIntegrationOff" }).key, (input as { value: boolean }).value)
          return { ok: true }
        } catch (error) {
          return failure(error)
        }
      },
      lock: async (input) => manager.lock((input as { id: string }).id).then(() => ({ ok: true }), failure),
      unlock: async (input) => manager.unlock((input as { id: string }).id, (input as { password: string }).password).then(() => ({ ok: true }), failure),
      test: async (input) => manager.test((input as { id: string }).id).then((probe) => ({ ok: true, probe }), failure),
      verify: async (input) => manager.verify((input as { id: string }).id, (input as { itemId: string }).itemId).then((probe) => ({ ok: true, probe }), failure),
    })
    const off = rpc ? manager.onChange(() => void rpc.events.emit("changed", {}).catch(() => undefined)) : () => undefined

    return () => {
      off()
      detach()
      if (--state.users > 0) return
      state.unregister.forEach((stop) => stop())
      const holder = globalThis as unknown as Record<symbol, Shared | undefined>
      if (holder[SHARED] === state) delete holder[SHARED]
    }
  },
})
