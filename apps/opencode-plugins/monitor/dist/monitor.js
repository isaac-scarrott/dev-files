import { Port } from "./handoff.js";
import { LineSplitter } from "./lines.js";
import { renderWake } from "./wrap.js";
const HOUR = 3_600_000;
const MAX_DELIVERY_FAILURES = 3;
const HEARTBEAT_MS = 60_000;
export class Monitor {
    def;
    deps;
    state = "ended";
    startedAt = 0;
    events = 0;
    lastEventAt;
    paused = false;
    restartCount = 0;
    lastRearmAt;
    nextRearmAt;
    seq = 0;
    restartNotice;
    heartbeatTimer;
    child;
    port;
    exited = Promise.resolve();
    splitter;
    pending = [];
    pendingBytes = 0;
    dropped = 0;
    notes = [];
    window = [];
    batchTimer;
    cycleTimer;
    ttlTimer;
    cycling = false;
    closing = false;
    chain = Promise.resolve();
    failures = 0;
    /** The command died on its own: the crash was reported as an error, so ending it is not news again. */
    crashed = false;
    matcher;
    /** The last process this monitor's command ran, for a waiter that blocks until the monitor ends. */
    lastExit;
    /** Matching lines, newest last: what a waiter gets when the monitor has already ended. */
    recent = [];
    waiters = new Set();
    constructor(def, deps) {
        this.def = def;
        this.deps = deps;
        this.splitter = new LineSplitter(deps.options.maxLineChars);
        this.matcher = def.match === undefined ? undefined : new RegExp(def.match);
    }
    /**
     * A fresh start, or (with `resume`) a restore after a service restart. The process is always new; what is kept is the
     * re-arm clock: a mark still ahead keeps its remaining time, a mark that passed while the service was down counts as
     * satisfied by this fresh start and the next one is set from now. The ttl is the stored absolute `expiresAt`, so
     * neither a re-arm nor a restart extends it.
     */
    start(resume) {
        const { clock } = this.deps;
        const now = clock.now();
        this.startedAt = now;
        let keepMark;
        if (resume) {
            this.seq = resume.state.seq;
            this.restartCount = resume.state.restartCount;
            this.events = resume.state.events;
            this.lastEventAt = resume.state.lastEventAt;
            this.restartNotice = resume.state.restartCount;
            this.lastRearmAt = resume.state.lastRearmAt;
            this.notes.push(resume.note);
            const mark = resume.state.nextRearmAt;
            if (this.def.rearmMinutes !== undefined && mark !== undefined && mark > now)
                keepMark = mark;
        }
        this.ttlTimer = clock.setTimeout(() => void this.end("it reached its time limit (start it again to keep watching)"), Math.max(0, this.def.expiresAt - now));
        this.heartbeatTimer = clock.setTimeout(() => this.heartbeat(), HEARTBEAT_MS);
        this.spawnRun({ rearmed: resume !== undefined && this.def.rearmMinutes !== undefined && keepMark === undefined, mark: keepMark });
        if (resume)
            this.scheduleFlush();
    }
    get pid() {
        return this.child?.pid;
    }
    /** The exit code of the command that ended this monitor, when it exited by itself (not when it was killed). A re-arm
     *  monitor outlives every one of its processes, so its last process exit says nothing about why it ended. */
    get exitCode() {
        if (this.def.rearmMinutes !== undefined)
            return undefined;
        return this.lastExit?.code ?? undefined;
    }
    /** The lines a waiter sees when the monitor ends: the newest matching lines, capped like a wake. */
    lastLines() {
        return [...this.recent];
    }
    /**
     * Blocks until the monitor produces its next batch of lines, ends, or `timeoutMs` passes. The end of the monitor and
     * its batches arrive through the same hooks as a wake (`flush`, `end`, `stop`), so nothing polls.
     */
    wait(timeoutMs, signal) {
        if (this.state === "ended")
            return Promise.resolve(this.exitOutcome());
        if (signal?.aborted)
            return Promise.resolve({ state: "timeout", lines: [] });
        return new Promise((resolve) => {
            let timer;
            let abort;
            const waiter = {
                settle: (outcome) => {
                    if (!this.waiters.delete(waiter))
                        return;
                    if (timer !== undefined)
                        this.deps.clock.clearTimeout(timer);
                    if (signal && abort)
                        signal.removeEventListener("abort", abort);
                    resolve(outcome);
                },
            };
            this.waiters.add(waiter);
            timer = this.deps.clock.setTimeout(() => waiter.settle({ state: "timeout", lines: [] }), Math.max(0, timeoutMs));
            if (signal) {
                abort = () => waiter.settle({ state: "timeout", lines: [] });
                signal.addEventListener("abort", abort, { once: true });
            }
        });
    }
    exitOutcome() {
        const exitCode = this.exitCode;
        return { state: "exited", ...(exitCode === undefined ? {} : { exitCode }), lines: this.lastLines() };
    }
    /** Tells every blocked waiter at once; each one settles only the first time. */
    wakeWaiters(outcome) {
        for (const waiter of [...this.waiters])
            waiter.settle(outcome);
    }
    /**
     * Plugin reload: the monitor leaves this instance with its process still running. Timers stop, the pipes are held
     * by the port until another instance attaches, nothing is saved or sent and the manager is not told it finished.
     */
    detach() {
        this.closing = true;
        this.clearTimers();
        this.wakeWaiters({ state: "timeout", lines: [] });
        this.port?.detach();
        const handoff = {
            def: this.def,
            child: this.child,
            port: this.port,
            memory: {
                seq: this.seq,
                restartCount: this.restartCount,
                restartNotice: this.restartNotice,
                state: this.state,
                startedAt: this.startedAt,
                events: this.events,
                lastEventAt: this.lastEventAt,
                paused: this.paused,
                lastRearmAt: this.lastRearmAt,
                nextRearmAt: this.nextRearmAt,
                pending: this.pending,
                pendingBytes: this.pendingBytes,
                dropped: this.dropped,
                notes: this.notes,
                window: this.window,
                failures: this.failures,
                cycling: this.cycling,
                splitter: this.splitter,
                recent: this.recent,
                lastExit: this.lastExit,
            },
        };
        this.child = undefined;
        this.port = undefined;
        this.state = "ended";
        return handoff;
    }
    /**
     * The other half of a plugin reload: takes over a running monitor. Same process, same counters, no restart count and
     * no notice. Timers are rebuilt from the stored marks (a mark that passed during the gap fires at once), then the
     * pipes are attached, replaying what arrived and an exit that happened in between.
     */
    adopt(handoff) {
        const { clock } = this.deps;
        const now = clock.now();
        const m = handoff.memory;
        this.seq = m.seq;
        this.restartCount = m.restartCount;
        this.restartNotice = m.restartNotice;
        this.state = m.state;
        this.startedAt = m.startedAt;
        this.events = m.events;
        this.lastEventAt = m.lastEventAt;
        this.paused = m.paused;
        this.lastRearmAt = m.lastRearmAt;
        this.nextRearmAt = m.nextRearmAt;
        this.pending = m.pending;
        this.pendingBytes = m.pendingBytes;
        this.dropped = m.dropped;
        this.notes = m.notes;
        this.window = m.window;
        this.failures = m.failures;
        this.cycling = m.cycling;
        this.splitter = m.splitter;
        this.recent = m.recent;
        this.lastExit = m.lastExit;
        this.ttlTimer = clock.setTimeout(() => void this.end("it reached its time limit (start it again to keep watching)"), Math.max(0, this.def.expiresAt - now));
        this.heartbeatTimer = clock.setTimeout(() => this.heartbeat(), HEARTBEAT_MS);
        if (this.def.rearmMinutes !== undefined && this.nextRearmAt !== undefined)
            this.cycleTimer = clock.setTimeout(() => this.cycle(), Math.max(0, this.nextRearmAt - now));
        if (this.pending.length > 0 || this.dropped > 0 || this.notes.length > 0)
            this.scheduleFlush();
        this.child = handoff.child;
        if (handoff.child && handoff.port)
            this.bind(handoff.child, handoff.port);
        void this.save();
    }
    snapshot() {
        return {
            seq: this.seq,
            restartCount: this.restartCount,
            aliveAt: this.deps.clock.now(),
            events: this.events,
            ...(this.lastEventAt === undefined ? {} : { lastEventAt: this.lastEventAt }),
            ...(this.lastRearmAt === undefined ? {} : { lastRearmAt: this.lastRearmAt }),
            ...(this.nextRearmAt === undefined ? {} : { nextRearmAt: this.nextRearmAt }),
        };
    }
    save() {
        return this.deps.saveState(this, this.snapshot()).catch((error) => this.deps.log(`${this.def.id} (${this.def.name}): could not save state: ${String(error)}`));
    }
    heartbeat() {
        if (this.closing)
            return;
        void this.save();
        this.heartbeatTimer = this.deps.clock.setTimeout(() => this.heartbeat(), HEARTBEAT_MS);
    }
    nextRunAt() {
        return this.state === "waiting" ? this.nextRearmAt : undefined;
    }
    tell(what) {
        try {
            this.deps.notify?.({ ...what, key: `monitor:${what.key}:${this.def.id}`, target: { session: this.def.sessionID }, at: this.deps.clock.now() });
        }
        catch (error) {
            this.deps.log(`${this.def.id} (${this.def.name}): could not notify: ${String(error)}`);
        }
    }
    /** Ends the monitor on request or because its session went away. No wake. */
    async stop(reason) {
        if (this.closing)
            return;
        this.closing = true;
        this.clearTimers();
        this.deps.log(`${this.def.id} (${this.def.name}): stopped: ${reason}`);
        await this.terminate();
        this.state = "ended";
        await this.chain;
        this.deps.finished(this, reason);
        this.wakeWaiters(this.exitOutcome());
    }
    /** After a handover: waits for wakes still being delivered, then records the last-alive time. */
    async settle() {
        await this.chain;
        await this.save();
    }
    /** Process-exit backstop: signals the process group at once. */
    killNow(signal) {
        this.child?.kill(signal);
    }
    /** Shutdown path: end the process and wait for it, nothing else. */
    async dispose() {
        this.closing = true;
        this.clearTimers();
        this.wakeWaiters({ state: "timeout", lines: [] });
        await this.terminate();
        this.state = "ended";
        await this.chain;
        await this.save(); // last-alive time for the downtime window of the next start
    }
    spawnRun(how = { rearmed: false }) {
        const { clock, spawn } = this.deps;
        const now = clock.now();
        if (how.rearmed)
            this.lastRearmAt = now;
        this.splitter = new LineSplitter(this.deps.options.maxLineChars);
        this.state = "running";
        const port = new Port();
        const child = spawn({ command: this.def.command, cwd: this.def.cwd }, port);
        this.child = child;
        this.bind(child, port);
        if (this.def.rearmMinutes !== undefined) {
            this.nextRearmAt = how.mark ?? now + this.def.rearmMinutes * 60_000;
            this.cycleTimer = clock.setTimeout(() => this.cycle(), this.nextRearmAt - now);
        }
        void this.save();
    }
    /** Routes a child's output and exit into this monitor. An exit already waiting in the port is delivered now. */
    bind(child, port) {
        const { log } = this.deps;
        let release;
        this.exited = new Promise((resolve) => (release = resolve));
        this.port = port;
        port.attach({
            data: (chunk) => {
                if (this.child === child)
                    for (const line of this.splitter.push(chunk))
                        this.accept(line);
            },
            exit: (code, signal) => {
                if (this.child !== child)
                    return;
                this.lastExit = { code, signal };
                this.child = undefined;
                child.kill("SIGKILL"); // stray members of the process group
                for (const line of this.splitter.flush())
                    this.accept(line);
                log(`${this.def.id} (${this.def.name}): process ended with ${signal ?? `code ${code}`}`);
                release();
                this.onExit(code, signal);
            },
        });
    }
    onExit(code, signal) {
        if (this.closing)
            return;
        const how = signal ? `was killed by ${signal}` : `exited with code ${code}`;
        if (this.cycling) {
            this.cycling = false;
            this.spawnRun({ rearmed: true });
            return;
        }
        if (this.def.rearmMinutes === undefined) {
            if (code !== 0) {
                this.crashed = true;
                this.tell({ kind: "error", title: "Monitor stopped", body: `"${this.def.name}" ${how}`, key: "error" });
            }
            void this.end(`the command ${how}`);
            return;
        }
        this.state = "waiting";
        if (code !== 0)
            this.notes.push(`The command ${how}; it starts again at ${new Date(this.nextRunAt() ?? 0).toISOString()}.`);
        this.flush();
    }
    /** The re-arm schedule fired: start a fresh run, ending the current one first if it is still going. */
    cycle() {
        if (this.closing)
            return;
        if (this.child) {
            this.cycling = true;
            this.signalChild();
        }
        else {
            this.spawnRun({ rearmed: true });
        }
    }
    accept(line) {
        if (this.closing || this.state === "ended")
            return;
        if (this.matcher && !this.matcher.test(line))
            return;
        this.recent.push(line);
        if (this.recent.length > this.deps.options.maxLinesPerWake)
            this.recent.shift();
        const { options, clock } = this.deps;
        const now = clock.now();
        while (this.window.length > 0 && now - this.window[0] >= HOUR)
            this.window.shift();
        if (this.window.length >= options.maxEventsPerHour) {
            if (!this.paused) {
                this.paused = true;
                this.notes.push(`Paused: more than ${options.maxEventsPerHour} lines in an hour. Lines are dropped, and counted, until the rate falls.`);
                this.tell({ kind: "error", severity: "warning", title: "Monitor paused", body: `"${this.def.name}" produced more than ${options.maxEventsPerHour} lines in an hour`, key: "paused" });
                this.deps.log(`${this.def.id} (${this.def.name}): paused after ${options.maxEventsPerHour} events in an hour`);
            }
            this.dropped += 1;
            this.scheduleFlush();
            return;
        }
        if (this.paused) {
            this.paused = false;
            this.notes.push("Resumed: the rate fell below the limit.");
        }
        this.window.push(now);
        this.events += 1;
        this.lastEventAt = now;
        const size = Buffer.byteLength(line);
        if (this.pending.length >= options.maxLinesPerWake || this.pendingBytes + size > options.maxBufferBytes) {
            this.dropped += 1;
        }
        else {
            this.pending.push(line);
            this.pendingBytes += size;
        }
        this.scheduleFlush();
        if (this.def.maxEvents !== undefined && this.events >= this.def.maxEvents)
            void this.end(`it reached its limit of ${this.def.maxEvents} events`);
    }
    scheduleFlush() {
        if (this.batchTimer !== undefined)
            return;
        this.batchTimer = this.deps.clock.setTimeout(() => this.flush(), this.def.batchSeconds * 1000);
    }
    flush(extra = []) {
        if (this.batchTimer !== undefined)
            this.deps.clock.clearTimeout(this.batchTimer);
        this.batchTimer = undefined;
        const notes = [...this.notes, ...extra];
        if (this.pending.length === 0 && this.dropped === 0 && notes.length === 0)
            return;
        // A batch a waiter is blocked on goes to the waiter, not the session: a wake would steer the session and interrupt
        // the tool call that is waiting for it. Notes wait for the next batch.
        if (!this.closing && this.pending.length > 0 && this.waiters.size > 0) {
            const lines = this.pending;
            this.pending = [];
            this.pendingBytes = 0;
            this.dropped = 0;
            this.wakeWaiters({ state: "event", lines: [...lines] });
            return;
        }
        this.seq += 1;
        const seq = this.seq;
        const restart = this.restartNotice;
        this.restartNotice = undefined;
        const text = renderWake({ name: this.def.name, id: this.def.id, seq, lines: this.pending, dropped: this.dropped, notes, restart });
        void this.save();
        this.deps.log(`${this.def.id} (${this.def.name}): wake ${seq}: ${this.pending.length} line(s), ${this.dropped} dropped`);
        this.pending = [];
        this.pendingBytes = 0;
        this.dropped = 0;
        this.notes = [];
        this.chain = this.chain.then(async () => {
            if (this.failures >= MAX_DELIVERY_FAILURES)
                return;
            try {
                await this.deps.deliver(this.def.sessionID, text, { monitorID: this.def.id, seq });
                this.failures = 0;
            }
            catch (error) {
                this.failures += 1;
                this.deps.log(`${this.def.id} (${this.def.name}): could not wake ${this.def.sessionID}: ${String(error)}`);
                if (this.failures >= MAX_DELIVERY_FAILURES && !this.closing)
                    this.tell({ kind: "error", title: "Monitor stopped", body: `"${this.def.name}" could not wake its session ${MAX_DELIVERY_FAILURES} times in a row`, key: "error" });
                if (this.failures >= MAX_DELIVERY_FAILURES && !this.closing)
                    void this.stop(`session ${this.def.sessionID} did not accept ${MAX_DELIVERY_FAILURES} wakes in a row`);
            }
        });
    }
    /** The monitor is finished by itself (exit, ttl, event limit): last wake with what is left, then forget it. */
    async end(reason) {
        if (this.closing)
            return;
        this.closing = true;
        this.clearTimers();
        await this.terminate();
        this.state = "ended";
        this.deps.log(`${this.def.id} (${this.def.name}): ${reason}`);
        if (!this.crashed)
            this.tell({ kind: "info", title: "Monitor ended", body: `"${this.def.name}": ${reason}`, key: "ended" });
        // The waiter gets the end before the session is told: a wake would steer the session and interrupt the tool call.
        const awaited = this.waiters.size > 0;
        this.wakeWaiters(this.exitOutcome());
        if (!awaited)
            this.flush([`Monitor ended: ${reason}.`]);
        await this.chain;
        this.deps.finished(this, reason);
    }
    clearTimers() {
        const { clock } = this.deps;
        for (const handle of [this.batchTimer, this.cycleTimer, this.ttlTimer, this.heartbeatTimer])
            if (handle !== undefined)
                clock.clearTimeout(handle);
        this.batchTimer = this.cycleTimer = this.ttlTimer = this.heartbeatTimer = undefined;
    }
    signalChild() {
        const child = this.child;
        if (!child)
            return;
        child.kill("SIGTERM");
        const grace = this.deps.clock.setTimeout(() => child.kill("SIGKILL"), this.deps.options.killGraceSeconds * 1000);
        void this.exited.then(() => this.deps.clock.clearTimeout(grace));
    }
    async terminate() {
        if (!this.child)
            return;
        this.signalChild();
        await this.exited;
    }
}
//# sourceMappingURL=monitor.js.map