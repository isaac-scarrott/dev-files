import type { Account } from "./contract.js";
import type { KeyStore, TokenStore } from "./keychain.js";
import type { Probe } from "./probe.js";
import { type AccountStore, type Confirmed, type Provider } from "./store.js";
export type Stores = {
    opToken: TokenStore;
    bw: KeyStore;
};
export type ManagerDeps = {
    file: string;
    stores: Stores;
    /** The CLI to run for each vendor when an account names none (the fixture, in tests). */
    bins?: Partial<Record<Provider, string>>;
    /** Where credentials rest, as the option said (`keychain`, `memory` or a `security` path): part of what makes an account the same one. */
    where?: string;
};
export type Tool = {
    bin: string;
    installed: boolean;
    path?: string;
    version?: string;
};
export type AccountView = {
    id: string;
    provider: Provider;
    label: string;
    /** `config`: set in opencode.json options, shown read-only. */
    source: "stored" | "config";
    enabled: boolean;
    allowedOrigins: string[];
    autoLockMinutes: number;
    vaults: string[];
    organizationId?: string;
    confirmEveryUse: boolean;
    alwaysAllowOtp: boolean;
    /** A token or API key is saved. A boolean: the credential itself never leaves the server. */
    credential: boolean;
    lock: {
        state: "unlocked" | "locked" | "unavailable" | "disabled";
        method?: string;
        expiresAt?: number;
        reason?: string;
    };
    /** The last connection test and login check of this process. */
    test?: {
        at: number;
        probe: Probe;
    };
    verified?: {
        at: number;
        itemId: string;
        probe: Probe;
    };
    /** A stored account that could not be built: why. */
    error?: string;
};
export type Overview = {
    accounts: AccountView[];
    tools: Record<Provider, Tool>;
    confirmed: Confirmed;
    file: string;
};
/**
 * The accounts of this process, once: the ones in opencode.json (read-only, they win) and the ones the settings page saved,
 * built into live accounts that blindfold looks up on every use. A change rebuilds only the account it touched, so an
 * unlocked session of another account survives, and nothing needs a restart.
 */
export declare function createManager(initial: ManagerDeps): {
    store: {
        readonly file: string;
        read: () => import("./store.js").StoreData;
        write: (value: Parameters<AccountStore["write"]>[0]) => void;
    };
    /** The accounts from opencode.json join (the latest set wins). Throws on a bad option. Returns the detach. */
    attach(accounts: unknown, next?: ManagerDeps): () => void;
    readonly attached: number;
    /** What blindfold looks up on every use. */
    accounts: () => readonly Account[];
    onChange(listener: () => void): () => undefined;
    overview(options?: {
        fresh?: boolean;
    }): Promise<Overview>;
    config: () => Record<string, Record<string, unknown>>;
    add(input: {
        provider: unknown;
        settings: unknown;
        secrets: unknown;
    }): Promise<{
        id: string;
    }>;
    update(input: {
        id: string;
        settings?: unknown;
        secrets?: unknown;
    }): Promise<void>;
    remove(id: string): Promise<void>;
    confirm(key: keyof Confirmed, value: boolean): void;
    lock(id: string): Promise<void>;
    /** Bitwarden: the master password unlocks (and logs in first with the saved API key). 1Password: nothing to type. */
    unlock(id: string, password: unknown): Promise<void>;
    test(id: string, timeoutMs?: number): Promise<Probe>;
    verify(id: string, itemId: string, timeoutMs?: number): Promise<Probe>;
    recheckTools: () => Promise<Record<Provider, Tool>>;
};
export type Manager = ReturnType<typeof createManager>;
