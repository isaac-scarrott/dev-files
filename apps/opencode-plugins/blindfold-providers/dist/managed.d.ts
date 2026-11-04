import type { Account } from "./contract.js";
import type { Probe } from "./probe.js";
/** An account the settings page can also test: both vendors' classes have these beyond the contract. */
export interface Managed extends Account {
    /** A credential is saved (keychain or configured variable), without opening a session. */
    hasCredential(): Promise<boolean>;
    probe(signal?: AbortSignal, timeoutMs?: number): Promise<Probe>;
    /** One login's password can be read: ok or not, never the value. 1Password only. */
    verify?(itemId: string, signal?: AbortSignal, timeoutMs?: number): Promise<Probe>;
    /** Forget saved credentials and lock. */
    forget?(): Promise<void>;
}
