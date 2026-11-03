/** Where a service-account token rests between sessions. */
export interface TokenStore {
    get(id: string): Promise<string | undefined>;
    /** False when it could not be saved (the token then lives in memory only). */
    set(id: string, token: string): Promise<boolean>;
    delete(id: string): Promise<void>;
}
export declare const memoryTokens: () => TokenStore;
/**
 * The macOS login keychain through `security`. The token never appears in argv: the command line goes to `security -i` on
 * stdin; reading prints the token on stdout, straight to this process.
 */
export declare function keychainTokens(bin?: string): TokenStore;
