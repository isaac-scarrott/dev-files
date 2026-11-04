import { accessSync, constants } from "node:fs";
import { parseAccounts } from "./config.js";
import { run } from "./run.js";
import { accountStore } from "./store.js";
import { cleanSettings, makeId, secret } from "./validate.js";
const DEFAULT_LOCK = 10;
const TOOL_TTL_MS = 15_000;
const toConfig = (stored, bin) => ({
    provider: stored.provider,
    label: stored.label,
    allowedOrigins: stored.allowedOrigins,
    autoLockMinutes: stored.autoLockMinutes,
    vaults: stored.vaults,
    organizationId: stored.organizationId,
    confirmEveryUse: stored.confirmEveryUse,
    bin,
});
/**
 * The accounts of this process, once: the ones in opencode.json (read-only, they win) and the ones the settings page saved,
 * built into live accounts that blindfold looks up on every use. A change rebuilds only the account it touched, so an
 * unlocked session of another account survives, and nothing needs a restart.
 */
export function createManager(deps) {
    const store = accountStore(deps.file);
    let data = store.read();
    const attached = new Map();
    const live = new Map();
    const broken = new Map();
    const tests = new Map();
    const checks = new Map();
    const listeners = new Set();
    let tools;
    const binFor = (provider) => deps.bins?.[provider];
    const options = () => [...attached.values()].at(-1) ?? {};
    function reconcile() {
        const want = new Map();
        for (const [id, raw] of Object.entries(options()))
            want.set(id, { source: "config", raw: raw });
        for (const [id, stored] of Object.entries(data.accounts))
            if (!want.has(id) && stored.enabled !== false)
                want.set(id, { source: "stored", raw: toConfig(stored, binFor(stored.provider)) });
        broken.clear();
        const next = new Map();
        for (const [id, { source, raw }] of want) {
            try {
                const [built] = parseAccounts({ accounts: { [id]: raw } }, raw.tokenStore === undefined ? deps.stores.opToken : undefined, deps.stores.bw);
                if (built)
                    next.set(id, { key: built.key, source, make: built.make, account: undefined });
            }
            catch (error) {
                broken.set(id, error instanceof Error ? error.message : String(error));
            }
        }
        for (const [id, entry] of live) {
            if (next.get(id)?.key === entry.key)
                continue;
            void entry.account.lock();
            live.delete(id);
            tests.delete(id);
            checks.delete(id);
        }
        for (const [id, entry] of next)
            if (!live.has(id))
                live.set(id, { key: entry.key, source: entry.source, account: entry.make() });
    }
    const notify = () => listeners.forEach((listener) => listener());
    function persist() {
        store.write(data);
        reconcile();
        notify();
    }
    async function checkTool(provider) {
        const bin = binFor(provider) ?? (provider === "1password" ? "op" : "bw");
        let path;
        if (bin.includes("/")) {
            try {
                accessSync(bin, constants.X_OK);
                path = bin;
            }
            catch {
                return { bin, installed: false };
            }
        }
        else {
            const found = await run("/usr/bin/which", [bin], {}, undefined, undefined, 5000);
            path = found.code === 0 ? found.stdout.trim().split("\n")[0] : undefined;
            if (!path)
                return { bin, installed: false };
        }
        const version = await run(bin, ["--version"], {}, undefined, undefined, 5000);
        return { bin, installed: version.code === 0 || !version.missing, path, ...(version.code === 0 ? { version: version.stdout.trim().split("\n")[0]?.slice(0, 40) } : {}) };
    }
    async function checkTools(fresh = false) {
        if (!fresh && tools && Date.now() - tools.at < TOOL_TTL_MS)
            return tools.value;
        const [onePassword, bitwarden] = await Promise.all([checkTool("1password"), checkTool("bitwarden")]);
        tools = { at: Date.now(), value: { "1password": onePassword, bitwarden } };
        return tools.value;
    }
    const find = (id) => live.get(id);
    async function view(id, source, settings) {
        const entry = find(id);
        let lock = { state: "disabled" };
        let credential = false;
        if (entry) {
            const state = await entry.account.status().catch(() => ({ state: "unavailable", reason: "status failed" }));
            lock = state.state === "unlocked" ? { state: "unlocked", method: state.method, ...(state.expiresAt ? { expiresAt: state.expiresAt } : {}) } : state.state === "locked" ? { state: "locked" } : { state: "unavailable", reason: state.reason };
            credential = await entry.account.hasCredential().catch(() => false);
        }
        else if (settings.enabled === false)
            lock = { state: "disabled" };
        else
            lock = { state: "unavailable", reason: broken.get(id) ?? "not loaded" };
        const info = entry?.account;
        return {
            id,
            provider: settings.provider,
            label: info?.label ?? settings.label,
            source,
            enabled: settings.enabled !== false,
            allowedOrigins: [...(info?.allowedOrigins ?? settings.allowedOrigins ?? [])],
            autoLockMinutes: settings.autoLockMinutes ?? DEFAULT_LOCK,
            vaults: settings.vaults ?? [],
            ...(settings.organizationId ? { organizationId: settings.organizationId } : {}),
            confirmEveryUse: info?.confirmEveryUse ?? settings.confirmEveryUse ?? false,
            credential,
            lock,
            ...(tests.get(id) ? { test: tests.get(id) } : {}),
            ...(checks.get(id) ? { verified: checks.get(id) } : {}),
            ...(broken.has(id) ? { error: broken.get(id) } : {}),
        };
    }
    /** An account seen from its configuration: what the options said, in the shape of the stored settings. */
    function fromOptions(id, raw) {
        const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : undefined);
        return {
            provider: raw.provider === "bitwarden" ? "bitwarden" : "1password",
            label: typeof raw.label === "string" ? raw.label : id,
            enabled: true,
            allowedOrigins: strings(raw.allowedOrigins),
            autoLockMinutes: typeof raw.autoLockMinutes === "number" ? raw.autoLockMinutes : undefined,
            vaults: strings(raw.vaults),
            organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
            confirmEveryUse: raw.confirmEveryUse === true,
        };
    }
    const known = () => new Set([...Object.keys(options()), ...Object.keys(data.accounts)]);
    function editable(id) {
        if (id in options())
            throw new Error("This account comes from opencode.json: change it there");
        const stored = data.accounts[id];
        if (!stored)
            throw new Error("No such account");
        return stored;
    }
    async function saveSecrets(id, provider, secrets) {
        const given = (typeof secrets === "object" && secrets !== null ? secrets : {});
        if (provider === "1password") {
            if (given.token === undefined)
                return false;
            const token = secret(given.token, "the service account token");
            if (!(await deps.stores.opToken.set(id, token)))
                throw new Error("The token could not be saved to the keychain (it holds a character the keychain path cannot store)");
            return true;
        }
        if (given.clientId === undefined && given.clientSecret === undefined)
            return false;
        const clientId = secret(given.clientId, "the client id");
        const clientSecret = secret(given.clientSecret, "the client secret");
        if (!(await deps.stores.bw.set(id, { clientId, clientSecret })))
            throw new Error("The API key could not be saved to the keychain");
        return true;
    }
    return {
        store,
        /** The accounts from opencode.json join (the latest set wins). Throws on a bad option. Returns the detach. */
        attach(accounts) {
            if (accounts !== undefined)
                parseAccounts({ accounts }, deps.stores.opToken, deps.stores.bw);
            const token = Symbol("attached");
            attached.set(token, (accounts ?? {}));
            data = store.read();
            reconcile();
            notify();
            return () => {
                attached.delete(token);
                if (attached.size === 0) {
                    for (const entry of live.values())
                        void entry.account.lock();
                    live.clear();
                    listeners.clear();
                }
                else {
                    reconcile();
                    notify();
                }
            };
        },
        get attached() {
            return attached.size;
        },
        /** What blindfold looks up on every use. */
        accounts: () => [...live.values()].map((entry) => entry.account),
        onChange(listener) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        async overview(options = {}) {
            data = store.read();
            reconcile();
            const configured = Object.entries(this.config()).map(([id, raw]) => view(id, "config", fromOptions(id, raw)));
            const stored = Object.entries(data.accounts).filter(([id]) => !(id in this.config())).map(([id, settings]) => view(id, "stored", settings));
            const [accounts, toolsNow] = await Promise.all([Promise.all([...configured, ...stored]), checkTools(options.fresh)]);
            return { accounts, tools: toolsNow, confirmed: data.confirmed, file: store.file };
        },
        config: () => options(),
        async add(input) {
            const provider = input.provider;
            if (provider !== "1password" && provider !== "bitwarden")
                throw new Error("provider must be 1password or bitwarden");
            const settings = cleanSettings(input.settings, provider);
            const id = makeId(settings.label, provider, known());
            if (provider === "1password" && (typeof input.secrets !== "object" || input.secrets === null || input.secrets.token === undefined))
                throw new Error("the service account token is required");
            if (provider === "bitwarden" && (typeof input.secrets !== "object" || input.secrets === null || input.secrets.clientSecret === undefined))
                throw new Error("the API key is required");
            await saveSecrets(id, provider, input.secrets);
            try {
                data = { ...data, accounts: { ...data.accounts, [id]: { provider, ...settings, enabled: settings.enabled !== false } } };
                persist();
            }
            catch (error) {
                await (provider === "1password" ? deps.stores.opToken.delete(id) : deps.stores.bw.delete(id));
                throw error;
            }
            return { id };
        },
        async update(input) {
            const current = editable(input.id);
            const merged = cleanSettings({ ...current, ...(typeof input.settings === "object" && input.settings !== null ? input.settings : {}) }, current.provider);
            await saveSecrets(input.id, current.provider, input.secrets);
            data = { ...data, accounts: { ...data.accounts, [input.id]: { provider: current.provider, ...merged, enabled: merged.enabled !== false } } };
            tests.delete(input.id);
            checks.delete(input.id);
            persist();
        },
        async remove(id) {
            const current = editable(id);
            const entry = find(id);
            if (entry?.account.forget)
                await entry.account.forget();
            else
                await (current.provider === "1password" ? deps.stores.opToken.delete(id) : deps.stores.bw.delete(id));
            const { [id]: _gone, ...rest } = data.accounts;
            data = { ...data, accounts: rest };
            tests.delete(id);
            checks.delete(id);
            persist();
        },
        confirm(key, value) {
            if (key !== "opAppIntegrationOff")
                throw new Error("unknown step");
            data = { ...data, confirmed: { ...data.confirmed, [key]: value } };
            persist();
        },
        async lock(id) {
            const entry = find(id);
            if (!entry)
                throw new Error("No such account");
            await entry.account.lock();
            notify();
        },
        /** Bitwarden: the master password unlocks (and logs in first with the saved API key). 1Password: nothing to type. */
        async unlock(id, password) {
            const entry = find(id);
            if (!entry)
                throw new Error("No such account");
            if (entry.account.kind === "bitwarden")
                await entry.account.unlock({ method: "masterPassword", password: secret(password, "the master password") });
            else
                await entry.account.status();
            notify();
        },
        async test(id, timeoutMs) {
            const entry = find(id);
            if (!entry)
                return { ok: false, code: "other", detail: "The account is disabled or not loaded" };
            const probe = await entry.account.probe(undefined, timeoutMs);
            tests.set(id, { at: Date.now(), probe });
            checks.delete(id);
            notify();
            return probe;
        },
        async verify(id, itemId, timeoutMs) {
            const entry = find(id);
            if (!entry?.account.verify)
                return { ok: false, code: "other", detail: "Not available for this account" };
            const probe = await entry.account.verify(itemId, undefined, timeoutMs);
            checks.set(id, { at: Date.now(), itemId, probe });
            notify();
            return probe;
        },
        recheckTools: () => checkTools(true),
    };
}
