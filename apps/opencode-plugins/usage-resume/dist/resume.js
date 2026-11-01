import { detectUsageLimit } from "./detect.js";
import { decide } from "./plan.js";
import { LIMIT_LIKE, oneLine } from "./diag.js";
import { availability } from "./usage.js";
const MAX_ANNOUNCEMENTS = 3;
const REANNOUNCE_MS = 5 * 60_000;
// A run that started this long after the failure was recorded was started by someone else.
const TOUCH_SLACK_MS = 2_000;
export function emptyState() {
    return { waiting: {}, attempts: {} };
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
        const limit = detectUsageLimit(error, at);
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
        const toggle = await this.toggles.effective(sessionID, info.parentID === undefined, info.time.created);
        if (!toggle.on)
            return this.skip(sessionID, toggle.why);
        const attempts = this.state.attempts[sessionID];
        if (attempts && attempts.count >= this.options.maxAttempts) {
            this.log(`${sessionID}: skip: attempt cap reached (${attempts.count}/${this.options.maxAttempts} resumes)`);
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
        if (completed && this.state.attempts[sessionID]) {
            delete this.state.attempts[sessionID];
            changed = true;
        }
        if (changed)
            await this.save();
    }
    /** Look at every waiting session that is due. Call on an interval; after sleep the first call catches up. */
    async tick() {
        if (this.busy)
            return;
        this.busy = true;
        try {
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
    }
    async announce(waiting) {
        if (waiting.announcements >= MAX_ANNOUNCEMENTS)
            return;
        if (waiting.announcedAt !== undefined && Math.abs(waiting.dueAt - waiting.announcedAt) < REANNOUNCE_MS)
            return;
        waiting.announcedAt = waiting.dueAt;
        waiting.announcements += 1;
        const at = formatTime(waiting.dueAt, this.clock.now());
        await this.notice(waiting.sessionID, `Claude usage limit reached. Resumes automatically at ${at}.`);
    }
    /** A timeline notice that does not wake the session. */
    async notice(sessionID, text) {
        if (!this.options.notices)
            return;
        await this.host.session
            .synthetic({ sessionID, text, description: text, delivery: "queue", resume: false })
            .catch((error) => this.log(`${sessionID}: notice failed: ${String(error)}`));
    }
    save() {
        return this.host.storage.set(this.key, this.state);
    }
}
//# sourceMappingURL=resume.js.map