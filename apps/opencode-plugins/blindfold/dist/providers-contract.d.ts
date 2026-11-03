export declare const PROVIDERS_PROTOCOL = 1;
export declare const PROVIDERS_KEY: unique symbol;
/** How an account is unlocked. None of these needs biometrics. */
export type UnlockMethod = 
/** A master password typed into blindfold's card, handed to the CLI on stdin or in its environment. */
"masterPassword"
/** A scoped machine token (1Password service account). No prompt; the token comes from the keychain or the card. */
 | "serviceAccount"
/** Bitwarden personal API key to log in, then the master password to unlock. */
 | "apiKey";
export interface Capabilities {
    readonly otp: boolean;
    readonly searchByOrigin: boolean;
    /** v1: false everywhere. */
    readonly write: boolean;
    /** No CLI can complete a WebAuthn ceremony: false everywhere. */
    readonly passkey: boolean;
    readonly unlock: readonly UnlockMethod[];
}
/** What an account says about itself. Never a value, never a session token. */
export interface AccountInfo {
    /** Config id, e.g. "work", "personal". Unique across providers. */
    readonly id: string;
    /** Shown to the user: "Work (Bitwarden)". */
    readonly label: string;
    /** "1password" | "bitwarden". */
    readonly kind: string;
    readonly capabilities: Capabilities;
    /**
     * Origin patterns this account may fill (`accounts.google.com`, `*.holibob.tech`, `https://x.test:8443`). Absent: any
     * origin its items are saved for. Present: the account is a fenced one, never offered anywhere else.
     */
    readonly allowedOrigins?: readonly string[];
}
export type LockState = {
    readonly state: "unlocked";
    readonly method: UnlockMethod;
    readonly expiresAt?: number;
} | {
    readonly state: "locked";
    readonly methods: readonly UnlockMethod[];
}
/** CLI missing, no network: the card says why and falls back to typing. */
 | {
    readonly state: "unavailable";
    readonly reason: string;
};
/** An item reference that is safe to show and log: ids and titles, no field values. */
export interface ItemRef {
    readonly account: string;
    readonly id: string;
    readonly title: string;
    /** Origins the item is saved for (`scheme://host[:port]`). */
    readonly origins: readonly string[];
    readonly hasOtp: boolean;
    /** Field names the item has: "username", "password", "otp". */
    readonly fields: readonly string[];
}
/** Which value of an item. `otp` is computed at read time. */
export type FieldRef = "username" | "password" | "otp" | {
    readonly label: string;
};
/** What an unlock needs, collected by blindfold's card (masked inputs) and handed straight over. */
export type UnlockInput = {
    readonly method: "masterPassword";
    readonly password: string;
} | {
    readonly method: "serviceAccount";
    readonly token: string;
} | {
    readonly method: "apiKey";
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly password: string;
};
export interface Account extends AccountInfo {
    status(): Promise<LockState>;
    /** Resolves to the new state, or throws an Error whose message is safe to show (never a value). */
    unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>;
    /** Drops the in-memory session now (auto-lock, "Lock", plugin dispose). */
    lock(): Promise<void>;
    /** Items whose saved URLs match the origin, without values. Throws `LockedError` when locked. */
    findByOrigin(origin: string, signal?: AbortSignal): Promise<readonly ItemRef[]>;
    /** Resolves a configured reference ("op://Agent/GitHub/password", "bw:<id>/password") to an item and field. */
    resolve(reference: string, signal?: AbortSignal): Promise<{
        item: ItemRef;
        field: FieldRef;
    }>;
    /** The value. Only blindfold calls this, after the user's approval or a saved rule. */
    read(item: ItemRef, field: FieldRef, signal?: AbortSignal): Promise<string>;
}
export declare class LockedError extends Error {
    readonly account: string;
    readonly methods: readonly UnlockMethod[];
    constructor(account: string, methods: readonly UnlockMethod[]);
}
/** True for a LockedError from any copy of this contract: a provider bundle and blindfold each carry their own class. */
export declare const isLocked: (error: unknown) => error is LockedError;
export interface Provider {
    readonly kind: string;
    /** Protocol majors this provider speaks. */
    readonly accepts: readonly number[];
    /** The provider plugin's own id. */
    readonly source: string;
    accounts(): readonly Account[];
}
/** A provider plugin calls this in setup and the returned function in its dispose. */
export declare function registerProvider(provider: Provider): () => void;
/** Blindfold calls this on every use: every account of every live provider, de-duplicated by id. */
export declare function accounts(): readonly Account[];
/** `scheme://host[:port]` of a URL, or undefined when it is not an http(s) URL. */
export declare function originOf(url: string): string | undefined;
/** The page is the item's origin, or a subdomain of it: same scheme and port, never a lookalike, never the reverse. */
export declare function originMatches(itemOrigin: string, pageOrigin: string): boolean;
/**
 * `pattern` is a host (`accounts.google.com`: that host only), `*.d` (`d` and every subdomain), or a full origin with a
 * scheme and optional port. Without a scheme only https matches, and without a port only the default port.
 */
export declare function patternMatches(pattern: string, pageOrigin: string): boolean;
