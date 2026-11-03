import { homedir } from "node:os";
import { join } from "node:path";
import { Bitwarden } from "./bitwarden.js";
import { keychainTokens } from "./keychain.js";
import { OnePassword } from "./onepassword.js";
const ID = /^[a-z][a-z0-9_-]{0,31}$/;
function fail(path, expected) {
    throw new Error(`blindfold-providers ${path} must be ${expected}`);
}
function text(value, path, fallback) {
    if (value === undefined && fallback !== undefined)
        return fallback;
    if (typeof value !== "string" || value === "")
        fail(path, "a non-empty string");
    return value;
}
function optionalText(value, path) {
    return value === undefined ? undefined : text(value, path);
}
function strings(value, path) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === ""))
        fail(path, "a list of non-empty strings");
    return value;
}
function minutes(value, path) {
    if (value === undefined)
        return undefined;
    if (typeof value !== "number" || !(value > 0))
        fail(path, "a positive number of minutes");
    return value;
}
const expand = (path) => (path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
/**
 * Reads the `accounts` option into account builders. The key of each is its whole configuration, so a reload with the same
 * settings keeps the unlocked session and a changed account starts locked.
 */
export function parseAccounts(options, tokens = keychainTokens()) {
    const raw = options.accounts;
    if (raw === undefined)
        return [];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw))
        fail("accounts", "an object of account id to settings");
    return Object.entries(raw).map(([id, value]) => {
        if (!ID.test(id))
            fail(`accounts.${id}`, "named with lowercase letters, digits, - or _");
        if (typeof value !== "object" || value === null || Array.isArray(value))
            fail(`accounts.${id}`, "an object");
        const config = value;
        const where = (name) => `accounts.${id}.${name}`;
        const provider = config.provider;
        const common = {
            id,
            autoLockMinutes: minutes(config.autoLockMinutes, where("autoLockMinutes")),
            allowedOrigins: strings(config.allowedOrigins, where("allowedOrigins")),
            bin: optionalText(config.bin, where("bin")),
        };
        if (provider === "1password") {
            const unlock = config.unlock ?? "serviceAccount";
            if (unlock !== "serviceAccount" && unlock !== "masterPassword")
                fail(where("unlock"), "serviceAccount or masterPassword");
            const method = unlock;
            const label = text(config.label, where("label"), `${id} (1Password)`);
            const settings = { ...common, label, method, address: optionalText(config.address, where("address")), shorthand: optionalText(config.shorthand, where("shorthand")), tokenEnv: optionalText(config.tokenEnv, where("tokenEnv")), vaults: strings(config.vaults, where("vaults")), tokens };
            return { id, key: JSON.stringify([provider, settings]), make: () => new OnePassword(settings) };
        }
        if (provider === "bitwarden") {
            const label = text(config.label, where("label"), `${id} (Bitwarden)`);
            const settings = {
                ...common,
                label,
                appDataDir: expand(text(config.appDataDir, where("appDataDir"), `~/.config/blindfold/bw-${id}`)),
                organizationId: optionalText(config.organizationId, where("organizationId")),
                syncOnUnlock: config.syncOnUnlock === undefined ? undefined : config.syncOnUnlock === true,
            };
            return { id, key: JSON.stringify([provider, settings]), make: () => new Bitwarden(settings) };
        }
        return fail(where("provider"), "1password or bitwarden");
    });
}
