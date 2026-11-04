import type { Managed } from "./managed.js";
import { type KeyStore, type TokenStore } from "./keychain.js";
export type Built = {
    id: string;
    key: string;
    make: () => Managed;
};
/**
 * Reads the `accounts` option into account builders. The key of each is its whole configuration, so a reload with the same
 * settings keeps the unlocked session and a changed account starts locked.
 */
export declare function parseAccounts(options: Record<string, unknown>, fallback?: TokenStore, keys?: KeyStore): Built[];
