const DEFAULT_KEY = "toggle/default";
const sessionKey = (id) => `toggle/session/${id}`;
/**
 * Auto-resume is opt-in. A session resumes only when its own toggle is on; the global default decides what a NEW session
 * starts with, and the session's own choice, once made, always wins. Subagents (sessions with a parent) are never on.
 */
export class Toggles {
    storage;
    now;
    constructor(storage, now) {
        this.storage = storage;
        this.now = now;
    }
    async default() {
        const stored = (await this.storage.get(DEFAULT_KEY).catch(() => undefined));
        return { enabled: stored?.enabled === true, since: typeof stored?.since === "number" ? stored.since : 0 };
    }
    async setDefault(enabled) {
        const current = await this.default();
        if (current.enabled === enabled)
            return;
        await this.storage.set(DEFAULT_KEY, { enabled, since: enabled ? this.now() : current.since });
    }
    /** The session's own choice, if it has made one or was created while the default was on. */
    async own(sessionID) {
        const stored = (await this.storage.get(sessionKey(sessionID)).catch(() => undefined));
        return typeof stored?.enabled === "boolean" ? stored.enabled : undefined;
    }
    async set(sessionID, enabled) {
        await this.storage.set(sessionKey(sessionID), { enabled });
    }
    /** A session was deleted: drop its stored choice. */
    async forget(sessionID) {
        await this.storage.remove(sessionKey(sessionID));
    }
    /** A session was created: it starts with the default as it is now. Keeps an existing choice. */
    async seed(sessionID) {
        if ((await this.own(sessionID)) !== undefined)
            return;
        const value = await this.default();
        if (value.enabled)
            await this.set(sessionID, true);
    }
    /** Whether the session may be resumed. `created` is the session's creation time, for sessions seen before they were seeded. */
    async effective(sessionID, root, created) {
        if (!root)
            return { on: false, why: "subagent" };
        const own = await this.own(sessionID);
        if (own !== undefined)
            return { on: own, why: own ? "session toggle on" : "session toggle off" };
        const value = await this.default();
        if (value.enabled && created >= value.since)
            return { on: true, why: "global default on" };
        return { on: false, why: "toggle off (no choice made, default off)" };
    }
}
//# sourceMappingURL=toggles.js.map