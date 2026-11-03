import { type Account, type AccountInfo, type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput, type UnlockMethod } from "./contract.js";
export type Session = {
    env: Record<string, string>;
    method: UnlockMethod;
};
/** An item list stays this long in memory: service accounts allow 1,000 requests a day. */
export declare const LIST_TTL_MS: number;
/**
 * What both vendors share: an in-memory session, an idle timer that locks it, and a short cache of item references (never
 * values). A subclass says how to unlock, list and read.
 */
export declare abstract class Base implements Account, AccountInfo {
    abstract readonly kind: string;
    abstract readonly capabilities: Capabilities;
    readonly id: string;
    readonly label: string;
    readonly allowedOrigins?: readonly string[];
    protected session: Session | undefined;
    protected cache: Map<string, {
        at: number;
        items: readonly ItemRef[];
    }>;
    readonly autoLockMs: number;
    private used;
    private timer;
    constructor(options: {
        id: string;
        label: string;
        autoLockMinutes?: number;
        allowedOrigins?: readonly string[];
    });
    /** Starts a session and its idle timer. */
    protected open(session: Session): void;
    /** A use of the session: the idle timer starts over. */
    protected touch(): void;
    protected env(): Record<string, string>;
    protected unlockMethods(): readonly UnlockMethod[];
    protected cached(key: string): readonly ItemRef[] | undefined;
    status(): Promise<LockState>;
    lock(): Promise<void>;
    abstract unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>;
    abstract findByOrigin(origin: string, signal?: AbortSignal): Promise<readonly ItemRef[]>;
    abstract resolve(reference: string, signal?: AbortSignal): Promise<{
        item: ItemRef;
        field: FieldRef;
    }>;
    abstract read(item: ItemRef, field: FieldRef, signal?: AbortSignal): Promise<string>;
}
