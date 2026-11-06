import { detectProviderCooldown, detectUsageLimit } from "./detect.js";
import { decide } from "./plan.js";
import { LIMIT_LIKE, oneLine } from "./diag.js";
import { availability } from "./usage.js";
const limitedKey = (sessionID) => `limited/${sessionID}`;
const MAX_ANNOUNCEMENTS = 3;
const REANNOUNCE_MS = 5 * 60_000;
// A run that started this long after the failure was recorded was started by someone else.
const TOUCH_SLACK_MS = 2_000;
export function emptyState() {
    return { waiting: {}, attempts: {}, limited: {} };
}
/** One state key per project location: the server runs one plugin instance per location over one shared storage. */
export function stateKey(directory) {
    let hash = 2166136261;
    for (const char of directory)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return `state/v2/${hash.toString(16)}`;
}
export function formatTime(at, now) {
    const date = new Date(at);
    const sameDay = date.toDateString() === new Date(now).toDateString();
    return sameDay
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
export class Resumer {
    host;
    options;
    clock;
    usage;
    state;
    toggles;
    samples;
    directory;
    key;
    log;
    busy = false;
    /** Called with a session id when what the GUI shows for it may have changed. */
    changed = () => { };
    /**
     * Called with what the user should hear. A wake that starts a turn says nothing (the run's own outcome does), so this is
     * the limit itself, a resume that moved, and giving up. The timeline notices stay the record in the session.
     */
    notify = () => { };
    constructor(host, options, clock, usage, state, toggles, samples, directory, key, log) {
        this.host = host;
        this.options = options;
        this.clock = clock;
        this.usage = usage;
        this.state = state;
        this.toggles = toggles;
        this.samples = samples;
        this.directory = directory;
        this.key = key;
        this.log = log;
    }
    static async create(host, options, clock, usage, toggles, samples, 
    /** The project location this instance serves; it acts only on sessions that live there. */
    directory, log = () => { }) {
        const key = stateKey(directory);
        const stored = (await host.storage.get(key).catch(() => undefined));
        const state = { ...emptyState(), ...stored };
        return new Resumer(host, options, clock, usage, state, toggles, samples, directory, key, log);
    }
    /** Session IDs currently waiting, for tests and diagnostics. */
    waiting() {
        return Object.values(this.state.waiting);
    }
    /**
     * The usage limit the session is stopped at, while it is stopped: set when a run fails on it, cleared when the session
     * moves on, and ignored once a stated reset time has passed (nothing would clear it for an opted-out session).
     * Read from shared storage, not this instance's state: the GUI asks whichever location's instance answers its call, and
     * only the instance that serves the session's location saw the failure.
     */
    async limited(sessionID) {
        const entry = (await this.host.storage.get(limitedKey(sessionID)).catch(() => undefined));
        if (!entry)
            return undefined;
        if (entry.resetsAt !== undefined && entry.resetsAt <= this.clock.now())
            return undefined;
        return { resumesAt: entry.dueAt };
    }
    /**
     * The session is stopped at a usage limit. Called when a run fails on it, and from the retry hook, which sees the limit
     * long before OpenCode gives up retrying an opted-out session.
     */
    async markLimited(sessionID, limit, at) {
        const known = this.state.limited[sessionID];
        if (known && known.resetsAt === limit.resetsAt)
            return;
        this.state.limited[sessionID] = { at: known?.at ?? at, kind: limit.kind, resetsAt: limit.resetsAt };
        await this.save();
        this.changed(sessionID);
    }
    /**
     * Brings waiting in line with the toggles of the sessions this instance saw stop at a limit: turned on while stopped,
     * start waiting; turned off, stop. The toggle is set through whichever instance answers the GUI, so the owner catches up
     * here (and on `tick`) instead of being told.
     */
    async reconcile(sessionID) {
        for (const id of sessionID ? [sessionID] : Object.keys(this.state.limited)) {
            const entry = this.state.limited[id];
            if (!entry)
                continue;
            if (entry.resetsAt !== undefined && entry.resetsAt <= this.clock.now())
                continue;
            const info = await this.host.session.get({ sessionID: id }).catch(() => undefined);
            if (!info || info.parentID !== undefined || info.time.archived !== undefined)
                continue;
            const on = (await this.toggles.effective(id, true, info.time.created)).on;
            if (on && !this.state.waiting[id])
                await this.register(id, entry, entry.at);
            else if (!on && this.state.waiting[id])
                await this.drop(id, "toggled off");
        }
    }
    attempts(sessionID) {
        return this.state.attempts[sessionID];
    }
    /** A run failed. If it is a Claude usage limit and the session's toggle is on, start waiting for it to clear. */
    async onFailed(sessionID, error, at) {
        if (!error)
            return;
        const info = await this.host.session.get({ sessionID }).catch(() => undefined);
        // Every location's instance hears every session's events; only the one serving the session's location acts.
        if (info && info.location.directory !== this.directory)
            return;
        this.log(`${sessionID}: run failed type=${error.type ?? "?"} status=${error.status ?? "-"} message="${oneLine(error.message)}"`);
        const limit = detectUsageLimit(error, at) ?? detectProviderCooldown(error);
        if (!limit) {
            if (LIMIT_LIKE.test(`${error.message ?? ""} ${error.response?.body ?? ""}`)) {
                this.log(`${sessionID}: error reads like a limit but is not one the detector knows; not resuming`);
                await this.samples.saveFirst("unmatched-limit-like-error", error);
            }
            return;
        }
        this.log(`${sessionID}: usage limit detected kind=${limit.kind ?? "unknown"} resetsAt=${limit.resetsAt ? new Date(limit.resetsAt).toISOString() : "not stated"}`);
        await this.samples.saveFirst("limit-error", error);
        if (!info)
            return this.skip(sessionID, "session not found");
        if (info.time.archived !== undefined)
            return this.skip(sessionID, "archived");
        if (info.parentID !== undefined)
            return this.skip(sessionID, "subagent");
        await this.markLimited(sessionID, limit, at);
        const toggle = await this.toggles.effective(sessionID, true, info.time.created);
        if (!toggle.on) {
            this.tell(sessionID, "error", "Usage limit reached", "limit", "Auto-resume is off for this session.");
            return this.skip(sessionID, toggle.why);
        }
        const attempts = this.state.attempts[sessionID];
        if (attempts && attempts.count >= this.options.maxAttempts) {
            this.log(`${sessionID}: skip: attempt cap reached (${attempts.count}/${this.options.maxAttempts} resumes)`);
            this.tell(sessionID, "error", "Usage limit reached again, not resuming", "giveup", `Stopped after ${attempts.count} automatic resumes.`);
            await this.notice(sessionID, `Usage limit reached again after ${attempts.count} automatic resumes. Not resuming automatically.`);
            delete this.state.waiting[sessionID];
            await this.save();
            return;
        }
        await this.register(sessionID, limit, at);
    }
    skip(sessionID, reason) {
        this.log(`${sessionID}: not resuming: ${reason}`);
    }
    /** The session moved on without us (a user prompt, a run, deletion, completion): stop waiting for it. */
    async onSettled(sessionID, completed = false) {
        let changed = false;
        if (this.state.waiting[sessionID]) {
            delete this.state.waiting[sessionID];
            changed = true;
        }
        if (this.state.limited[sessionID]) {
            delete this.state.limited[sessionID];
            await this.host.storage.remove(limitedKey(sessionID)).catch(() => { });
            changed = true;
        }
        if (completed && this.state.attempts[sessionID]) {
            delete this.state.attempts[sessionID];
            changed = true;
        }
        if (changed) {
            await this.save();
            this.changed(sessionID);
        }
    }
    /** Look at every waiting session that is due. Call on an interval; after sleep the first call catches up. */
    async tick() {
        if (this.busy)
            return;
        this.busy = true;
        try {
            await this.reconcile().catch((error) => this.log(`reconcile: ${String(error)}`));
            const now = this.clock.now();
            const due = Object.values(this.state.waiting)
                .filter((w) => w.dueAt <= now)
                .sort((a, b) => a.dueAt - b.dueAt);
            let first = true;
            for (const waiting of due) {
                if (!first && this.options.staggerMs > 0)
                    await this.clock.sleep(this.options.staggerMs);
                first = false;
                await this.process(waiting.sessionID).catch((error) => this.log(`${waiting.sessionID}: ${String(error)}`));
            }
        }
        finally {
            this.busy = false;
        }
    }
    async register(sessionID, limit, stalledAt) {
        const prior = this.state.attempts[sessionID]?.count ?? 0;
        const backoff = prior > 0 ? this.options.retryBackoffMs * 2 ** (prior - 1) : 0;
        const notBefore = stalledAt + this.options.marginMs + backoff;
        const waiting = {
            sessionID,
            stalledAt,
            notBefore,
            dueAt: notBefore,
            kind: limit.kind,
            resetsAt: limit.resetsAt,
            unverified: 0,
            announcements: 0,
        };
        const decision = await this.evaluate(waiting);
        waiting.dueAt = decision.action === "wait" ? decision.at : waiting.notBefore;
        this.state.waiting[sessionID] = waiting;
        this.log(`${sessionID}: scheduled first check at ${new Date(waiting.dueAt).toISOString()} (not before ${new Date(notBefore).toISOString()}, attempt ${prior + 1}/${this.options.maxAttempts})`);
        await this.announce(waiting);
        await this.save();
        this.changed(sessionID);
    }
    async evaluate(waiting) {
        const readings = await this.usage.refresh().catch(() => []);
        const now = this.clock.now();
        const a = availability(readings, now, waiting.stalledAt);
        const nextPoll = this.usage.nextPollAt(readings.map((r) => r.id));
        return decide(waiting, a, now, this.options.marginMs, nextPoll);
    }
    async process(sessionID) {
        const waiting = this.state.waiting[sessionID];
        if (!waiting)
            return;
        if (this.clock.now() - waiting.stalledAt > this.options.maxWaitMs)
            return this.drop(sessionID, "waited too long");
        const info = await this.host.session.get({ sessionID }).catch(() => undefined);
        if (!info)
            return this.drop(sessionID, "deleted");
        if (info.time.archived !== undefined)
            return this.drop(sessionID, "archived");
        if (info.time.busy !== undefined && (info.time.idle === undefined || info.time.busy > info.time.idle))
            return this.drop(sessionID, "running again");
        if (info.time.busy !== undefined && info.time.busy > waiting.stalledAt + TOUCH_SLACK_MS)
            return this.drop(sessionID, "touched since the stall");
        if (info.outcome !== undefined && info.outcome !== "failed")
            return this.drop(sessionID, `finished ${info.outcome}`);
        // The toggle can be turned off while waiting; it is read again at the moment of resuming.
        const toggle = await this.toggles.effective(sessionID, info.parentID === undefined, info.time.created);
        if (!toggle.on)
            return this.drop(sessionID, toggle.why);
        const decision = await this.evaluate(waiting);
        if (decision.action === "wait") {
            waiting.dueAt = decision.at;
            this.log(`${sessionID}: not yet available, next check at ${new Date(decision.at).toISOString()}${decision.unverified ? " (reset passed, usage not confirmed)" : ""}`);
            if (decision.unverified)
                waiting.unverified += 1;
            await this.announce(waiting);
            await this.save();
            return;
        }
        // Forget the stall before sending: the prompt's own events must not look like the user touching the session.
        delete this.state.waiting[sessionID];
        const attempts = this.state.attempts[sessionID] ?? { count: 0, lastAt: 0 };
        this.state.attempts[sessionID] = { count: attempts.count + 1, lastAt: this.clock.now() };
        await this.save();
        try {
            await this.host.session.prompt({ sessionID, text: this.options.prompt, delivery: "queue" });
            this.log(`${sessionID}: resumed (${decision.verified ? "usage verified" : "reset time only"})`);
        }
        catch (error) {
            this.log(`${sessionID}: resume failed: ${String(error)}`);
            this.state.waiting[sessionID] = { ...waiting, dueAt: this.clock.now() + this.options.retryBackoffMs };
            await this.save();
        }
    }
    async drop(sessionID, reason) {
        this.log(`${sessionID}: not resuming: ${reason}`);
        delete this.state.waiting[sessionID];
        await this.save();
        this.changed(sessionID);
    }
    async announce(waiting) {
        if (waiting.announcements >= MAX_ANNOUNCEMENTS)
            return;
        if (waiting.announcedAt !== undefined && Math.abs(waiting.dueAt - waiting.announcedAt) < REANNOUNCE_MS)
            return;
        waiting.announcedAt = waiting.dueAt;
        waiting.announcements += 1;
        const at = formatTime(waiting.dueAt, this.clock.now());
        // The first announcement is the limit being hit; later ones are the resume time moving, which starts no turn.
        if (waiting.announcements === 1)
            this.tell(waiting.sessionID, "error", `Usage limit reached, resumes ${at}`, "limit");
        else
            this.tell(waiting.sessionID, "info", `Resumes ${at}`, "resume");
        await this.notice(waiting.sessionID, `Claude usage limit reached. Resumes automatically at ${at}.`);
    }
    tell(sessionID, kind, title, key, body) {
        try {
            // No `body: undefined`: the RPC event's schema rejects an undefined string.
            this.notify({ kind, title, ...(body === undefined ? {} : { body }), key: `usage-resume:${key}:${sessionID}`, target: { session: sessionID }, at: this.clock.now() });
        }
        catch (error) {
            this.log(`${sessionID}: could not notify: ${String(error)}`);
        }
    }
    /** A timeline notice that does not wake the session. */
    async notice(sessionID, text) {
        if (!this.options.notices)
            return;
        await this.host.session
            .synthetic({ sessionID, text, description: text, delivery: "queue", resume: false })
            .catch((error) => this.log(`${sessionID}: notice failed: ${String(error)}`));
    }
    async save() {
        await this.host.storage.set(this.key, this.state);
        for (const [id, entry] of Object.entries(this.state.limited)) {
            await this.host.storage.set(limitedKey(id), { ...entry, dueAt: this.state.waiting[id]?.dueAt });
        }
    }
}
//# sourceMappingURL=resume.js.map