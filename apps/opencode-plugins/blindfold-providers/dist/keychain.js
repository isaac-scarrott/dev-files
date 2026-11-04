import { run } from "./run.js";
export const memoryTokens = () => {
    const tokens = new Map();
    return {
        get: async (id) => tokens.get(id),
        set: async (id, token) => !!tokens.set(id, token),
        delete: async (id) => void tokens.delete(id),
    };
};
export function apiKeys(ids, secrets) {
    return {
        async get(id) {
            const [clientId, clientSecret] = await Promise.all([ids.get(id), secrets.get(id)]);
            return clientId && clientSecret ? { clientId, clientSecret } : undefined;
        },
        async set(id, key) {
            if (!(await ids.set(id, key.clientId)))
                return false;
            if (await secrets.set(id, key.clientSecret))
                return true;
            await ids.delete(id);
            return false;
        },
        async delete(id) {
            await Promise.all([ids.delete(id), secrets.delete(id)]);
        },
    };
}
/** The keychain items of the accounts, by what they hold. `memory` and a `security` path are for tests. */
export function keychainStores(where = "keychain") {
    const make = (prefix) => (where === "memory" ? memoryTokens() : keychainTokens(where === "keychain" ? "security" : where, prefix));
    return { opToken: make("blindfold-op-"), bw: apiKeys(make("blindfold-bw-id-"), make("blindfold-bw-secret-")) };
}
// A token is base64url-like. Anything else would need quoting inside `security -i`, so it is not written.
const SAFE = /^[A-Za-z0-9._\-=+/]+$/;
/**
 * The macOS login keychain through `security`. The token never appears in argv: the command line goes to `security -i` on
 * stdin; reading prints the token on stdout, straight to this process.
 */
export function keychainTokens(bin = "security", prefix = "blindfold-op-") {
    const service = (id) => `${prefix}${id}`;
    return {
        async get(id) {
            const result = await run(bin, ["find-generic-password", "-s", service(id), "-a", "opencode", "-w"], {});
            const token = result.stdout.replace(/\n$/, "");
            return result.code === 0 && token !== "" ? token : undefined;
        },
        async set(id, token) {
            if (!SAFE.test(token))
                return false;
            const result = await run(bin, ["-i"], {}, `add-generic-password -U -s ${service(id)} -a opencode -w "${token}"\n`);
            return result.code === 0;
        },
        async delete(id) {
            await run(bin, ["delete-generic-password", "-s", service(id), "-a", "opencode"], {});
        },
    };
}
