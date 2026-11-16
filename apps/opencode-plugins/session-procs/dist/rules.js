/**
 * One over-threshold stretch is one notice: crossing reports once, dropping resets, crossing again reports again.
 * `runawayMinutes` only delays the report, never the clock the orphan rule reuses.
 */
export function evaluateRunaway(state, cpu, runawayCpu, runawayMinutes, now) {
    if (cpu < runawayCpu)
        return { state: { notified: false }, report: false };
    const since = state.since ?? now;
    const report = !state.notified && now - since >= runawayMinutes * 60_000;
    return { state: { since, notified: state.notified || report }, report };
}
const live = (view) => [...view.members, ...view.escapees].map((proc) => proc.pid);
/**
 * The reap table, as decisions and nothing else:
 *
 * | session archived or deleted      | every group of that session, live background jobs included |
 * | session idle, no monitor, not busy| leftovers only: groups whose shell exited                  |
 * | sub-agent session, same conditions| the same, on the shorter sub-agent window                  |
 * | orphan over the CPU line, same    | that group                                                |
 *
 * A group whose shell is still alive is a live background job and is never idle-reaped. A decision is taken once per
 * group, so the idle and orphan rows cannot both speak for it. A session whose facts could not be read is left alone.
 */
export function decide(input) {
    const { views, sessions, monitors, now, options } = input;
    const decided = [];
    const claimed = new Set();
    const push = (view, rule, reason) => {
        if (claimed.has(view.group.pgid))
            return;
        claimed.add(view.group.pgid);
        decided.push({ group: view.group, rule, pids: live(view), reason });
    };
    for (const view of views) {
        const facts = sessions.get(view.group.sessionID);
        // Not knowing is not a reason to kill: only a session the host says is gone or archived is.
        if (facts === undefined)
            continue;
        if (!facts.exists) {
            push(view, "session-end", "the session was deleted");
            continue;
        }
        if (facts.archived) {
            push(view, "session-end", "the session was archived");
            continue;
        }
        if (facts.busy)
            continue;
        const leftover = !view.leaderAlive && view.members.length + view.escapees.length > 0;
        const subagent = facts.parentID !== undefined;
        const minutes = subagent ? options.subagentIdleMinutes : options.idleMinutes;
        // No monitor plugin loaded means a monitor might be running: never idle-reap then.
        if (leftover && monitors !== undefined && !monitors.has(view.group.sessionID) && facts.idleAt !== undefined && now - facts.idleAt >= minutes * 60_000) {
            push(view, subagent ? "subagent-idle" : "idle", `idle for ${Math.round((now - facts.idleAt) / 60_000)}m`);
            continue;
        }
        const since = input.runawaySince(view.group.pgid);
        if (view.orphan && since !== undefined && view.cpu >= options.runawayCpu && now - since >= options.orphanKillMinutes * 60_000) {
            push(view, "orphan", `orphaned and over ${options.runawayCpu}% CPU for ${options.orphanKillMinutes}m`);
        }
    }
    return decided;
}
