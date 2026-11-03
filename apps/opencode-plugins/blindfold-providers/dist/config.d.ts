import type { Account } from "./contract.js";
import { type TokenStore } from "./keychain.js";
export type Built = {
    id: string;
    key: string;
    make: () => Account;
};
/**
 * Reads the `accounts` option into account builders. The key of each is its whole configuration, so a reload with the same
 * settings keeps the unlocked session and a changed account starts locked.
 */
export declare function parseAccounts(options: Record<string, unknown>, fallback?: TokenStore): Built[];
