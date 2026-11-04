/** Where a service-account token rests between sessions. */
export interface TokenStore {
    get(id: string): Promise<string | undefined>;
    /** False when it could not be saved (the token then lives in memory only). */
    set(id: string, token: string): Promise<boolean>;
    delete(id: string): Promise<void>;
}
export declare const memoryTokens: () => TokenStore;
/** A Bitwarden personal API key: the client id and its secret. */
export type ApiKey = {
    clientId: string;
    clientSecret: string;
};
/** Where a Bitwarden API key rests: two keychain items, so each stays a plain token the `security -i` path can write. */
export interface KeyStore {
    get(id: string): Promise<ApiKey | undefined>;
    set(id: string, key: ApiKey): Promise<boolean>;
    delete(id: string): Promise<void>;
}
export declare function apiKeys(ids: TokenStore, secrets: TokenStore): KeyStore;
/** The keychain items of the accounts, by what they hold. `memory` and a `security` path are for tests. */
export declare function keychainStores(where?: "keychain" | "memory" | string): {
    opToken: TokenStore;
    bw: KeyStore;
};
/**
 * The macOS login keychain through `security`. The token never appears in argv: the command line goes to `security -i` on
 * stdin; reading prints the token on stdout, straight to this process.
 */
export declare function keychainTokens(bin?: string, prefix?: string): TokenStore;
