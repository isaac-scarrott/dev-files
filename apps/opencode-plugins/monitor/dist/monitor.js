import { LineSplitter } from "./lines.js";
import { renderWake } from "./wrap.js";
const HOUR = 3_600_000;
const MAX_DELIVERY_FAILURES = 3;
export class Monitor {
    def;
    deps;
    state = "ended";
    startedAt = 0;
    events = 0;
    lastEventAt;
    paused = false;
    seq = 0;
    child;
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
    cycleStart = 0;
    cycling = false;
    closing = false;
    chain = Promise.resolve();
    failures = 0;
    matcher;
    constructor(def, deps) {
        this.def = def;
        this.deps = deps;
        this.splitter = new LineSplitter(deps.options.maxLineChars);
        this.matcher = def.match === undefined ? undefined : new RegExp(def.match);
    }
    /** `note` goes into the first wake, for example that the monitor came back after a restart. */
    start(note) {
        const { clock } = this.deps;
        this.startedAt = clock.now();
        if (note)
            this.notes.push(note);
        this.ttlTimer = clock.setTimeout(() => void this.end("it reached its time limit (start it again to keep watching)"), Math.max(0, this.def.expiresAt - clock.now()));
        this.spawnRun();
        if (note)
            this.scheduleFlush();
    }
    nextRunAt() {
        return this.state === "waiting" && this.def.rearmMinutes !== undefined ? this.cycleStart + this.def.rearmMinutes * 60_000 : undefined;
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
    }
    /** Shutdown path: end the process and wait for it, nothing else. */
    async dispose() {
        this.closing = true;
        this.clearTimers();
        await this.terminate();
        this.state = "ended";
        await this.chain;
    }
    spawnRun() {
        const { clock, spawn, log } = this.deps;
        this.cycleStart = clock.now();
        this.splitter = new LineSplitter(this.deps.options.maxLineChars);
        this.state = "running";
        let release;
        this.exited = new Promise((resolve) => (release = resolve));
        const child = spawn({ command: this.def.command, cwd: this.def.cwd }, {
            data: (chunk) => {
                if (this.child === child)
                    for (const line of this.splitter.push(chunk))
                        this.accept(line);
            },
            exit: (code, signal) => {
                if (this.child !== child)
                    return;
                this.child = undefined;
                child.kill("SIGKILL"); // stray members of the process group
                for (const line of this.splitter.flush())
                    this.accept(line);
                log(`${this.def.id} (${this.def.name}): process ended with ${signal ?? `code ${code}`}`);
                release();
                this.onExit(code, signal);
            },
        });
        this.child = child;
        if (this.def.rearmMinutes !== undefined) {
            this.cycleTimer = clock.setTimeout(() => this.cycle(), this.def.rearmMinutes * 60_000);
        }
    }
    onExit(code, signal) {
        if (this.closing)
            return;
        const how = signal ? `was killed by ${signal}` : `exited with code ${code}`;
        if (this.cycling) {
            this.cycling = false;
            this.spawnRun();
            return;
        }
        if (this.def.rearmMinutes === undefined) {
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
            this.spawnRun();
        }
    }
    accept(line) {
        if (this.closing || this.state === "ended")
            return;
        if (this.matcher && !this.matcher.test(line))
            return;
        const { options, clock } = this.deps;
        const now = clock.now();
        while (this.window.length > 0 && now - this.window[0] >= HOUR)
            this.window.shift();
        if (this.window.length >= options.maxEventsPerHour) {
            if (!this.paused) {
                this.paused = true;
                this.notes.push(`Paused: more than ${options.maxEventsPerHour} lines in an hour. Lines are dropped, and counted, until the rate falls.`);
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
        this.seq += 1;
        const seq = this.seq;
        const text = renderWake({ name: this.def.name, id: this.def.id, seq, lines: this.pending, dropped: this.dropped, notes });
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
        this.flush([`Monitor ended: ${reason}.`]);
        await this.chain;
        this.deps.finished(this, reason);
    }
    clearTimers() {
        const { clock } = this.deps;
        for (const handle of [this.batchTimer, this.cycleTimer, this.ttlTimer])
            if (handle !== undefined)
                clock.clearTimeout(handle);
        this.batchTimer = this.cycleTimer = this.ttlTimer = undefined;
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