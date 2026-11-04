import { Plugin } from "@opencode/plugin";
import { registerProvider, PROVIDERS_PROTOCOL } from "./contract.js";
import { keychainStores } from "./keychain.js";
import { createManager } from "./manager.js";
import { Providers } from "./rpc.js";
import { defaultStoreFile } from "./store.js";
const SHARED = Symbol.for("opencode-plugins.blindfold.providers.manager.v1");
/**
 * The manager lives once per process, not once per location: the server plugin runs for every project, and unlocking Work
 * once must serve all of them. Held on globalThis (like the registry) so it survives a module reload.
 */
function depsOf(options) {
    return {
        file: typeof options.accountsFile === "string" ? options.accountsFile : defaultStoreFile(),
        stores: keychainStores(typeof options.tokenStore === "string" ? options.tokenStore : "keychain"),
        where: typeof options.tokenStore === "string" ? options.tokenStore : "keychain",
        bins: typeof options.bins === "object" && options.bins !== null ? options.bins : undefined,
    };
}
function shared(options) {
    const holder = globalThis;
    const existing = holder[SHARED];
    if (existing)
        return existing;
    const manager = createManager(depsOf(options));
    const kinds = ["1password", "bitwarden"];
    // Both vendors are registered for as long as the plugin runs: the accounts are read lazily, so one added or removed on
    // the settings page is seen by the next use with no re-registration.
    const unregister = kinds.map((kind) => registerProvider({ kind, accepts: [PROVIDERS_PROTOCOL], source: "blindfold-providers", accounts: () => manager.accounts().filter((account) => account.kind === kind) }));
    return (holder[SHARED] = { manager, users: 0, unregister });
}
const failure = (error) => ({ ok: false, error: error instanceof Error ? error.message : "failed" });
export default Plugin.define({
    id: "blindfold-providers",
    async setup(ctx) {
        const state = shared(ctx.options);
        const { manager } = state;
        let detach;
        try {
            detach = manager.attach(ctx.options.accounts, depsOf(ctx.options));
        }
        catch (error) {
            if (state.users === 0) {
                state.unregister.forEach((stop) => stop());
                delete globalThis[SHARED];
            }
            throw error;
        }
        state.users++;
        const rpc = await ctx.rpc?.register(Providers, {
            overview: async (input) => (await manager.overview({ fresh: input.fresh === true })),
            add: async (input) => {
                try {
                    return { ok: true, ...(await manager.add(input)) };
                }
                catch (error) {
                    return failure(error);
                }
            },
            update: async (input) => manager.update(input).then(() => ({ ok: true }), failure),
            remove: async (input) => manager.remove(input.id).then(() => ({ ok: true }), failure),
            confirm: async (input) => {
                try {
                    manager.confirm(input.key, input.value);
                    return { ok: true };
                }
                catch (error) {
                    return failure(error);
                }
            },
            lock: async (input) => manager.lock(input.id).then(() => ({ ok: true }), failure),
            unlock: async (input) => manager.unlock(input.id, input.password).then(() => ({ ok: true }), failure),
            test: async (input) => manager.test(input.id).then((probe) => ({ ok: true, probe }), failure),
            verify: async (input) => manager.verify(input.id, input.itemId).then((probe) => ({ ok: true, probe }), failure),
        });
        const off = rpc ? manager.onChange(() => void rpc.events.emit("changed", {}).catch(() => undefined)) : () => undefined;
        return () => {
            off();
            detach();
            if (--state.users > 0)
                return;
            state.unregister.forEach((stop) => stop());
            const holder = globalThis;
            if (holder[SHARED] === state)
                delete holder[SHARED];
        };
    },
});
