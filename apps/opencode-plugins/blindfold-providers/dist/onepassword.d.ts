import type { Managed } from "./managed.js";
import { Base } from "./account.js";
import { type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput } from "./contract.js";
import { type TokenStore } from "./keychain.js";
import { type Probe } from "./probe.js";
export type OnePasswordOptions = {
    id: string;
    label: string;
    /** `serviceAccount` (default): a token for a vault-scoped machine identity, no app and no prompt. `masterPassword`: the whole account. */
    method?: "serviceAccount" | "masterPassword";
    bin?: string;
    /** Sign-in address for `masterPassword`. */
    address?: string;
    /** `op` account shorthand for `masterPassword` (its session variable is OP_SESSION_<shorthand>). Defaults to the id. */
    shorthand?: string;
    /** An environment variable of the service that holds the token. The keychain is looked at first. */
    tokenEnv?: string;
    vaults?: readonly string[];
    tokens?: TokenStore;
    autoLockMinutes?: number;
    allowedOrigins?: readonly string[];
    confirmEveryUse?: boolean;
    alwaysAllowOtp?: boolean;
};
/**
 * 1Password through the `op` CLI, with the desktop-app integration off on every call (OP_BIOMETRIC_UNLOCK_ENABLED=false):
 * `op` never asks the 1Password app, so no "Allow opencode-cli" dialog and no biometrics.
 */
export declare class OnePassword extends Base implements Managed {
    readonly kind = "1password";
    readonly capabilities: Capabilities;
    private readonly bin;
    private readonly otpOf;
    private readonly method;
    private readonly address;
    private readonly shorthand;
    private readonly tokenEnv;
    private readonly vaults;
    private readonly tokens;
    constructor(options: OnePasswordOptions);
    private base;
    private serviceSession;
    /** A service account with a saved token is unlocked without a prompt: the token is the session. */
    status(): Promise<LockState>;
    unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>;
    lock(): Promise<void>;
    /** Forgets the saved token as well: the next use asks for a new one. */
    forget(): Promise<void>;
    private call;
    private list;
    /** Where a service-account call gets its token now: this session, the keychain, then the service's environment variable. */
    private token;
    /** Whether a token is saved (the keychain or the configured variable), without opening a session. */
    hasCredential(): Promise<boolean>;
    /**
     * Connection test: lists the vaults' logins the way a use would and reports how many, never a value. Runs with the
     * app integration off and gives up after `timeoutMs` (an app dialog never answers).
     */
    probe(signal?: AbortSignal, timeoutMs?: number): Promise<Probe>;
    /** Reads one login's password and reports only whether it could be read. The value is dropped here. */
    verify(itemId: string, signal?: AbortSignal, timeoutMs?: number): Promise<Probe>;
    findByOrigin(pageOrigin: string, signal?: AbortSignal): Promise<ItemRef[]>;
    /**
     * The list does not say which parts a login has, so the ones that matched a page are read once to see whether they carry
     * a one-time password field. Only the field types are kept: the values in the reply are dropped here.
     */
    private withParts;
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
