import { randomBytes } from "node:crypto";
import { nextCron, parseCron } from "./cron.js";
import { resolveTarget, label } from "./targets.js";
import { formatSpan, parseAt, parseDuration } from "./when.js";
import { deliver, wakeMetadata } from "./wake.js";
export const STATE_KEY = "state/v1";
const MAX_ENDED = 20;
const NAME_CHARS = 60;
const MAX_FAILURES = 3;
const RETRY_MS = 60_000;
const MAX_PROMPT_CHARS = 20_000;
export const emptyState = () => ({ jobs: [], ended: [] });
const newId = () => `sch_${randomBytes(4).toString("hex")}`;
function defaultName(prompt) {
    const line = (prompt.trim().split("\n")[0] ?? "").trim();
    return line.length > NAME_CHARS ? `${line.slice(0, NAME_CHARS - 1)}…` : line || "task";
}
export const isoLocal = (at) => {
    const d = new Date(at);
    const pad = (n) => String(n).padStart(2, "0");
    const offset = -d.getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
};
/** Missing sessions and archived ones end a job; anything else is treated as a passing failure. */
function gone(error) {
    const text = `${error?.name ?? ""} ${error?._tag ?? ""} ${String(error?.message ?? error)}`;
    return /not.?found|no such|does not exist|missing/i.test(text);
}
export class Scheduler {
    options;
    clock;
    storage;
    state;
    log;
    anyHost;
    queue = Promise.resolve();
    constructor(options, clock, storage, state, log, 
    /** Any live host that can reach the session API; the server runs one plugin instance per project location. */
    anyHost) {
        this.options = options;
        this.clock = clock;
        this.storage = storage;
        this.state = state;
        this.log = log;
        this.anyHost = anyHost;
    }
    static async create(options, clock, storage, log, anyHost) {
        const stored = (await storage.get(STATE_KEY).catch(() => undefined));
        const state = { ...emptyState(), ...stored };
        return new Scheduler(options, clock, storage, state, log, anyHost);
    }
    locked(fn) {
        const run = this.queue.then(fn, fn);
        this.queue = run.catch(() => { });
        return run;
    }
    save() {
        return this.storage.set(STATE_KEY, this.state);
    }
    end(job, reason) {
        this.state.jobs = this.state.jobs.filter((j) => j.id !== job.id);
        this.state.ended = [{ id: job.id, name: job.name, target: job.target, reason, at: this.clock.now(), runs: job.runs }, ...this.state.ended].slice(0, MAX_ENDED);
        this.log(`${job.id} "${job.name}" ended: ${reason}`);
    }
    /** Earliest time an active job is due, or undefined when nothing is waiting. */
    nextDueAt() {
        const due = this.state.jobs.filter((j) => j.status === "active").map((j) => j.nextRun);
        return due.length ? Math.min(...due) : undefined;
    }
    nextFor(job, from) {
        if (job.kind === "every")
            return from + (job.everyMs ?? 0);
        if (job.kind === "cron")
            return nextCron(parseCron(job.cron ?? ""), from);
        return undefined;
    }
    add(host, caller, input) {
        return this.locked(async () => {
            const now = this.clock.now();
            const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
            if (!prompt)
                throw new Error("prompt must not be empty");
            if (prompt.length > MAX_PROMPT_CHARS)
                throw new Error(`prompt is longer than ${MAX_PROMPT_CHARS} characters`);
            const given = [input.at, input.every, input.cron].filter((v) => v !== undefined);
            if (given.length !== 1)
                throw new Error("Give exactly one of at (one-off), every (repeat every N minutes, hours or days) or cron (5-field)");
            if (this.state.jobs.length >= this.options.maxSchedules)
                throw new Error(`There are already ${this.state.jobs.length} schedules (limit ${this.options.maxSchedules}). Cancel some with cancel_schedule first.`);
            if (input.maxRuns !== undefined && (!Number.isInteger(input.maxRuns) || input.maxRuns < 1))
                throw new Error("maxRuns must be a positive whole number");
            const minMs = this.options.minIntervalSeconds * 1000;
            let kind;
            let spec;
            let nextRun;
            let everyMs;
            let cron;
            if (input.at !== undefined) {
                kind = "once";
                nextRun = parseAt(String(input.at), now);
                if (nextRun <= now)
                    throw new Error(`${input.at} is in the past (now is ${isoLocal(now)})`);
                spec = `at ${isoLocal(nextRun)}`;
            }
            else if (input.every !== undefined) {
                kind = "every";
                everyMs = parseDuration(input.every);
                if (everyMs < minMs)
                    throw new Error(`every must be at least ${formatSpan(minMs)} (plugin option minIntervalSeconds)`);
                nextRun = now + everyMs;
                spec = `every ${formatSpan(everyMs)}`;
            }
            else {
                kind = "cron";
                cron = String(input.cron).trim();
                const parsed = parseCron(cron);
                const first = nextCron(parsed, now);
                if (first === undefined)
                    throw new Error(`cron "${cron}" never matches a real date`);
                const second = nextCron(parsed, first);
                if (second !== undefined && second - first < minMs)
                    throw new Error(`cron "${cron}" runs more often than every ${formatSpan(minMs)} (plugin option minIntervalSeconds)`);
                nextRun = first;
                spec = `cron ${cron}`;
            }
            const target = await resolveTarget(host, caller, input.session, this.options.scope);
            if (target.time.archived !== undefined)
                throw new Error(`${label(target)} is archived`);
            const job = {
                id: newId(),
                name: (input.name ?? "").trim() || defaultName(prompt),
                kind,
                prompt,
                sessionID: target.id,
                target: label(target),
                createdAt: now,
                spec,
                everyMs,
                cron,
                maxRuns: input.maxRuns,
                nextRun,
                runs: 0,
                fires: [],
                failures: 0,
                status: "active",
            };
            this.state.jobs.push(job);
            await this.save();
            this.log(`${job.id} "${job.name}" added for ${job.target}: ${spec}, next ${isoLocal(nextRun)}`);
            return { job };
        });
    }
    list() {
        return { jobs: [...this.state.jobs].sort((a, b) => a.nextRun - b.nextRun), ended: this.state.ended };
    }
    cancel(id) {
        return this.locked(async () => {
            const job = this.state.jobs.find((j) => j.id === id.trim());
            if (!job)
                return { cancelled: undefined };
            this.end(job, "cancelled");
            await this.save();
            return { cancelled: job };
        });
    }
    /** Fire every active job that is due. After sleep or a restart the first call catches up: a missed recurring job fires once. */
    tick() {
        return this.locked(async () => {
            const now = this.clock.now();
            const due = this.state.jobs.filter((j) => j.status === "active" && j.nextRun <= now).sort((a, b) => a.nextRun - b.nextRun);
            for (const job of due)
                await this.fire(job, now).catch((error) => this.log(`${job.id}: ${String(error)}`));
        });
    }
    async fire(job, now) {
        const host = this.anyHost();
        if (!host)
            return;
        let info;
        try {
            info = await host.session.get({ sessionID: job.sessionID });
        }
        catch (error) {
            if (gone(error)) {
                this.end(job, "target session was deleted");
                return this.save();
            }
            return this.failed(job, now, `could not read the target session: ${String(error)}`);
        }
        if (info.time.archived !== undefined) {
            this.end(job, "target session was archived");
            return this.save();
        }
        const windowMs = this.options.loopWindowMinutes * 60_000;
        job.fires = job.fires.filter((t) => now - t < windowMs);
        if (job.fires.length >= this.options.loopMaxFires) {
            job.status = "paused";
            job.pausedReason = `fired ${job.fires.length} times in the last ${this.options.loopWindowMinutes} minutes`;
            this.log(`${job.id} "${job.name}" paused: ${job.pausedReason}`);
            await this.save();
            await this.notice(host, job.sessionID, `Scheduled task "${job.name}" (${job.id}) was paused: it ${job.pausedReason}. It stays in list_schedules; cancel_schedule removes it.`);
            return;
        }
        const scheduled = job.nextRun;
        const lateMs = now - scheduled;
        const previous = { failures: job.failures, nextRun: job.nextRun, lastRun: job.lastRun, runs: job.runs, fires: job.fires };
        job.runs += 1;
        job.lastRun = now;
        job.fires = [...job.fires, now];
        const next = this.nextFor(job, now);
        const finished = next === undefined || (job.maxRuns !== undefined && job.runs >= job.maxRuns);
        if (finished)
            this.end(job, next === undefined ? "ran once" : `reached maxRuns (${job.maxRuns})`);
        else
            job.nextRun = next;
        // Saved before the prompt: a crash between the two skips a run rather than repeating it.
        await this.save();
        const wake = { id: job.id, name: job.name, prompt: job.prompt, scheduled, lateMs, recurring: job.kind !== "once" };
        try {
            await host.session.prompt({
                sessionID: job.sessionID,
                text: deliver(wake, this.options.lateSeconds * 1000),
                delivery: "steer",
                metadata: wakeMetadata(wake, job.kind, now),
            });
            job.failures = 0;
            this.log(`${job.id} "${job.name}" woke ${job.target}${lateMs > this.options.lateSeconds * 1000 ? ` (${formatSpan(lateMs)} late)` : ""}${finished ? "" : `, next ${isoLocal(job.nextRun)}`}`);
        }
        catch (error) {
            // Put the job back so the run is not lost.
            Object.assign(job, previous);
            if (finished) {
                this.state.jobs.push(job);
                this.state.ended = this.state.ended.filter((e) => e.id !== job.id);
            }
            job.nextRun = now + RETRY_MS;
            await this.failed(job, now, `delivery failed: ${String(error)}`);
        }
    }
    async failed(job, now, why) {
        job.failures += 1;
        job.nextRun = now + RETRY_MS;
        this.log(`${job.id} "${job.name}": ${why} (${job.failures}/${MAX_FAILURES})`);
        if (job.failures >= MAX_FAILURES)
            this.end(job, why);
        await this.save();
    }
    async notice(host, sessionID, text) {
        await host.session.synthetic({ sessionID, text, description: text, delivery: "queue", resume: false }).catch((error) => this.log(`${sessionID}: notice failed: ${String(error)}`));
    }
}
//# sourceMappingURL=scheduler.js.map