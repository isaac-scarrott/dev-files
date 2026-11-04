import type { Managed } from "./managed.js";
import { Base } from "./account.js";
import { type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput } from "./contract.js";
import { type KeyStore } from "./keychain.js";
import { type Probe } from "./probe.js";
export type BitwardenOptions = {
    id: string;
    label: string;
    bin?: string;
    /** One data directory per account (BITWARDENCLI_APPDATA_DIR): its `data.json` keeps the login and the server. */
    appDataDir: string;
    organizationId?: string;
    autoLockMinutes?: number;
    allowedOrigins?: readonly string[];
    /** Pull the vault after each unlock (default true). */
    syncOnUnlock?: boolean;
    confirmEveryUse?: boolean;
    /** A saved API key logs in by itself, so unlocking takes only the master password. */
    apiKeys?: KeyStore;
};
/**
 * Bitwarden (cloud, no SSO) through the `bw` CLI: `bw login --apikey` once, then the master password to unlock. The master
 * password goes to the child through its environment (`--passwordenv`), the session (BW_SESSION) lives here and nowhere
 * else, and `bw lock` runs when the idle timer fires: the CLI itself never expires a session.
 */
export declare class Bitwarden extends Base implements Managed {
    readonly kind = "bitwarden";
    readonly capabilities: Capabilities;
    private readonly bin;
    private readonly appData;
    private readonly organizationId;
    private readonly sync;
    private readonly keys;
    constructor(options: BitwardenOptions);
    hasCredential(): Promise<boolean>;
    private base;
    status(): Promise<LockState>;
    unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>;
    forget(): Promise<void>;
    private loggedOut;
    /** Connection test: signed in and unlocked, then how many collections the account can list. Counts only. */
    probe(signal?: AbortSignal, timeoutMs?: number): Promise<Probe>;
    lock(): Promise<void>;
    private call;
    protected unlockMethods(): readonly ["masterPassword"];
    findByOrigin(pageOrigin: string, signal?: AbortSignal): Promise<readonly ItemRef[]>;
    resolve(reference: string): Promise<{
        item: {
            account: string;
            id: string;
            title: string;
            origins: never[];
            hasOtp: boolean;
            fields: string[];
        };
        field: FieldRef;
    }>;
    read(item: ItemRef, field: FieldRef, signal?: AbortSignal): Promise<string>;
}
