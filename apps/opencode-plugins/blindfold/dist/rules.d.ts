import { type AccountInfo } from "./providers-contract.js";
/** A rule from the options: which accounts may serve a secret name, or an origin. */
export type ConfigRule = {
    name?: string;
    origin?: string;
    account: readonly string[];
    ref?: string;
};
/** A rule the user saved with "Always allow": this origin (or name), this account, this item field. Never a value. */
export type SavedRule = {
    id: string;
    /** The page origin it applies to (`https://accounts.google.com`), or absent for a name rule. */
    origin?: string;
    /** The secret name it applies to, for a rule that is not about a page. */
    name?: string;
    account: string;
    /** The item it was saved for; a rule for another item of the same account does not cover. */
    item?: string;
    itemTitle?: string;
    /** The item field: `username`, `password`, `otp` or a label. */
    field: string;
    /**
     * What it was saved for. A `fill` rule lets the value go to a page only; a `get` rule (or none) also lets it go to the
     * agent's code, so it covers a fill as well, never the other way round.
     */
    via?: "get" | "fill";
    created: number;
};
/** Reads the `rules` option. Throws a message that names the rule. */
export declare function parseRules(value: unknown): ConfigRule[];
/**
 * The accounts that may serve a page. An account with `allowedOrigins` is fenced: it serves only those origins. When a rule
 * names the origin, only the accounts it names serve it; otherwise every account that is not fenced out does.
 */
export declare function permitted(origin: string, accounts: readonly AccountInfo[], rules: readonly ConfigRule[]): AccountInfo[];
/** The rule from the options for a secret name, if any. */
export declare const nameRule: (name: string, rules: readonly ConfigRule[]) => ConfigRule | undefined;
export type Use = {
    account: string;
    field: string;
    item?: string;
    origin?: string;
    name?: string;
    via?: "get" | "fill";
};
/** A saved rule that covers this use, or undefined. An origin use needs the same origin; a name use the same name. */
export declare function covering(saved: readonly SavedRule[], use: Use): SavedRule | undefined;
/** The saved rules, kept in the plugin's storage. Only ids, origins, account ids and field names are written. */
export declare function savedRules(store: {
    get(key: string): Promise<unknown>;
    set(key: string, value: any): Promise<void>;
}, id: () => string, now?: () => number): {
    list: () => Promise<SavedRule[]>;
    /** Saves a rule unless an equal one exists. */
    add(use: Use & {
        itemTitle?: string;
    }): Promise<SavedRule>;
    revoke(ruleID: string): Promise<boolean>;
};
