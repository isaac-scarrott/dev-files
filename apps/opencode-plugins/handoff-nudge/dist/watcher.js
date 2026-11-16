import { afterStep, coldGap, coldWarningDue, emptyWatch } from "./measure.js";
import { coldNotice, formatTokens, handoffPrompt, tierNotice } from "./nudge.js";
import { modelMatches } from "./options.js";
const key = (sessionID) => `session/${sessionID}`;
/**
 * Watches one location's sessions. Every instance reads and writes per-session records, so a record written through
 * whichever instance answered the GUI is the one the owning instance acts on at the next step.
 */
export class Watcher {
    host;
    options;
    clock;
    directory;
    log;
    /** Called with a session id when what the GUI shows for it may have changed. */
    changed = () => { };
    /** Called with a notification to publish. */
    tell = () => { };
    constructor(host, options, clock, 
    /** The project location this instance serves; it warns only for sessions that live there. */
    directory, log = () => { }) {
        this.host = host;
        this.options = options;
        this.clock = clock;
        this.directory = directory;
        this.log = log;
    }
    async read(sessionID) {
        const stored = (await this.host.storage.get(key(sessionID)).catch(() => undefined));
        return stored ? { ...emptyWatch(), ...stored } : undefined;
    }
    /** Whether this instance should watch the session at all: a root session, here, on a model the options name. */
    async watches(sessionID) {
        const info = await this.host.session.get({ sessionID }).catch(() => undefined);
        if (!info || info.parentID !== undefined)
            return false;
        if (info.location.directory !== this.directory)
            return false;
        return modelMatches(info.model?.id, this.options.models);
    }
    async onStep(sessionID, tokens) {
        if (!(await this.watches(sessionID)))
            return;
        const now = this.clock.now();
        const prior = await this.read(sessionID);
        let watch = prior ?? emptyWatch();
        // Only the first step of a turn can be a cold wake; a turn that started before this instance loaded has no gap to trust.
        const cold = prior !== undefined && !prior.inTurn && coldGap(prior.lastStepAt, now);
        if (cold)
            watch = { ...watch, coldWrite: tokens.cache.write };
        const step = afterStep(watch, tokens, this.options.tiers);
        watch = { ...step.watch, inTurn: true, lastStepAt: now };
        await this.save(sessionID, watch);
        if (cold && coldWarningDue(watch, this.options.coldWrite, now)) {
            watch = { ...watch, coldWarnedAt: now };
            await this.save(sessionID, watch);
            this.log(`${sessionID}: cold wake wrote ${formatTokens(tokens.cache.write)} at ${formatTokens(watch.context)} context`);
            await this.warn(sessionID, coldNotice({ context: watch.context, coldWrite: tokens.cache.write }));
            this.changed(sessionID);
        }
        if (step.fired) {
            this.log(`${sessionID}: context ${formatTokens(watch.context)} reached tier ${formatTokens(step.fired)}`);
            await this.warn(sessionID, tierNotice({ context: watch.context, coldWrite: watch.coldWrite }));
            this.tell({
                title: `Context is ${formatTokens(watch.context)}`,
                body: "A handoff is cheaper than another long turn: the successor starts from a short handoff instead of this whole context.",
                key: `handoff-nudge:${sessionID}:${step.fired}`,
                sessionID,
            });
            this.changed(sessionID);
        }
    }
    /** A run ended: the next step starts a new turn, which is the only one that can show a cold wake. */
    async onTurnEnd(sessionID) {
        const watch = await this.read(sessionID);
        if (!watch || !watch.inTurn)
            return;
        await this.save(sessionID, { ...watch, inTurn: false });
    }
    async forget(sessionID) {
        await this.host.storage.remove(key(sessionID)).catch(() => { });
        this.changed(sessionID);
    }
    /** "Hand off now": queue the same instruction as a user prompt, and hide the pill until the next tier. */
    async handoff(sessionID) {
        const info = await this.host.session.get({ sessionID }).catch(() => undefined);
        if (!info || info.parentID !== undefined)
            return false;
        const watch = (await this.read(sessionID)) ?? emptyWatch();
        if (watch.context <= 0) {
            this.log(`${sessionID}: handoff skipped: no context measured yet`);
            return false;
        }
        await this.host.session.prompt({ sessionID, text: handoffPrompt({ context: watch.context, coldWrite: watch.coldWrite }), delivery: "queue" });
        await this.save(sessionID, { ...watch, dismissed: watch.tier });
        this.log(`${sessionID}: queued a handoff instruction at ${formatTokens(watch.context)} context`);
        this.changed(sessionID);
        return true;
    }
    /** "Not now": keep the pill quiet until a higher tier fires. */
    async dismiss(sessionID) {
        const watch = (await this.read(sessionID)) ?? emptyWatch();
        if (watch.dismissed >= watch.tier)
            return false;
        await this.save(sessionID, { ...watch, dismissed: watch.tier });
        this.log(`${sessionID}: dismissed ${formatTokens(watch.tier)} until the next tier`);
        this.changed(sessionID);
        return true;
    }
    async warn(sessionID, text) {
        await this.host.session
            .synthetic({ sessionID, text, description: text, delivery: "queue", resume: false })
            .catch((error) => this.log(`${sessionID}: warning failed: ${String(error)}`));
    }
    async save(sessionID, watch) {
        await this.host.storage.set(key(sessionID), watch);
    }
}
//# sourceMappingURL=watcher.js.map