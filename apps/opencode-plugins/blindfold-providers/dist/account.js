import { LockedError } from "./contract.js";
/** An item list stays this long in memory: service accounts allow 1,000 requests a day. */
export const LIST_TTL_MS = 5 * 60_000;
/**
 * What both vendors share: an in-memory session, an idle timer that locks it, and a short cache of item references (never
 * values). A subclass says how to unlock, list and read.
 */
export class Base {
    id;
    label;
    allowedOrigins;
    confirmEveryUse;
    session;
    cache = new Map();
    autoLockMs;
    used = 0;
    timer;
    constructor(options) {
        this.id = options.id;
        this.label = options.label;
        this.allowedOrigins = options.allowedOrigins;
        this.confirmEveryUse = options.confirmEveryUse;
        this.autoLockMs = Math.round((options.autoLockMinutes ?? 10) * 60_000);
    }
    /** Starts a session and its idle timer. */
    open(session) {
        this.session = session;
        this.touch();
    }
    /** A use of the session: the idle timer starts over. */
    touch() {
        if (!this.session)
            return;
        this.used = Date.now();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.lock(), this.autoLockMs);
        this.timer.unref?.();
    }
    env() {
        if (!this.session)
            throw new LockedError(this.id, this.unlockMethods());
        this.touch();
        return this.session.env;
    }
    unlockMethods() {
        return this.capabilities.unlock;
    }
    cached(key) {
        const hit = this.cache.get(key);
        return hit && Date.now() - hit.at < LIST_TTL_MS ? hit.items : undefined;
    }
    async status() {
        if (this.session)
            return { state: "unlocked", method: this.session.method, expiresAt: this.used + this.autoLockMs };
        return { state: "locked", methods: this.unlockMethods() };
    }
    async lock() {
        clearTimeout(this.timer);
        this.session = undefined;
        this.cache.clear();
    }
}
