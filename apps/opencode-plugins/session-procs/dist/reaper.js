import { liveProcs } from "./ps.js";
import { reapNotice } from "./report.js";
/** After SIGKILL, how long before the final look: a signalled process still shows up until it is reaped. */
const POST_KILL_MS = 250;
/**
 * Re-reads the process table immediately before signalling and keeps only what still belongs to the group: our uid, a
 * start time at or after the group's, and for a member the group's own pgid. 1, the service, this process and a
 * monitor's group are never in the list.
 */
export function verified(group, snapshot, deps) {
    const floor = Math.floor(group.startedAt / 1000) - 1;
    return liveProcs(snapshot, group.pgid, group.startedAt, deps.uid, group.escapees).filter((proc) => proc.pid > 1 && proc.pid !== deps.servicePid && proc.pid !== deps.selfPid && proc.start >= floor);
}
/**
 * SIGTERM to the group and to each escapee, `killGraceSeconds` to go, then SIGKILL whatever is left. The group is
 * signalled as a group so children that forked after the first snapshot go too; each escapee is signalled by pid.
 */
export async function reap(group, deps) {
    const first = await deps.ps();
    const monitors = deps.monitorGroups();
    if (monitors?.has(group.pgid))
        return { state: "skipped", signaled: [], survivors: [], reason: "a monitor owns this group" };
    const targets = verified(group, first, deps);
    if (targets.length === 0)
        return { state: "gone", signaled: [], survivors: [], reason: "nothing of the group is left" };
    const inGroup = targets.filter((proc) => proc.pgid === group.pgid);
    const escaped = targets.filter((proc) => proc.pgid !== group.pgid);
    deps.log({ event: "signal", signal: "SIGTERM", pgid: group.pgid, pids: targets.map((proc) => proc.pid), escapees: escaped.map((proc) => proc.pid) });
    if (inGroup.length > 0)
        deps.kill(-group.pgid, "SIGTERM");
    for (const proc of escaped)
        deps.kill(proc.pid, "SIGTERM");
    await deps.sleep(deps.graceMs);
    const second = await deps.ps();
    let left = verified(group, second, deps).filter((proc) => targets.some((target) => target.pid === proc.pid && target.start === proc.start));
    if (left.length > 0) {
        deps.log({ event: "signal", signal: "SIGKILL", pgid: group.pgid, pids: left.map((proc) => proc.pid) });
        for (const proc of left)
            deps.kill(proc.pid, "SIGKILL");
        if (left.some((proc) => proc.pgid === group.pgid))
            deps.kill(-group.pgid, "SIGKILL");
        // SIGKILL is not synchronous: a process is gone once it has been reaped. A short look tells a survivor from a corpse.
        await deps.sleep(POST_KILL_MS);
        const third = await deps.ps();
        left = left.filter((proc) => third.byPid.get(proc.pid)?.start === proc.start);
    }
    const survivors = left.map((proc) => proc.pid);
    if (survivors.length > 0)
        deps.log({ event: "survivors", pgid: group.pgid, pids: survivors });
    return { state: "reaped", signaled: targets.map((proc) => proc.pid), survivors };
}
/**
 * One decision, dry or real. In `dryRun` nothing is signalled and the notice says what would have been ended; the
 * decision is reported once, since the group stays and the same rule would otherwise fire at every scan.
 */
export async function apply(decision, procs, report, deps) {
    const now = deps.now();
    if (deps.dryRun) {
        if (deps.ledger.reported(decision.group.pgid, decision.rule))
            return;
        deps.ledger.markReported(decision.group.pgid, decision.rule);
        deps.log({ event: "reap", dryRun: true, pgid: decision.group.pgid, rule: decision.rule, pids: decision.pids, reason: decision.reason });
        if (report)
            deps.reporter.queue(decision.group.sessionID, reapNotice(decision, procs, decision.pids, true), deps.reporter.notice(decision, decision.pids, true, now));
        return;
    }
    const outcome = await reap(decision.group, deps.reap);
    deps.log({ event: "reap", dryRun: false, pgid: decision.group.pgid, rule: decision.rule, state: outcome.state, signaled: outcome.signaled, survivors: outcome.survivors });
    if (outcome.state === "skipped")
        return;
    if (outcome.state === "reaped" && report)
        deps.reporter.queue(decision.group.sessionID, reapNotice(decision, procs, outcome.signaled, false), deps.reporter.notice(decision, outcome.signaled, false, now));
    if (outcome.survivors.length === 0)
        await deps.ledger.drop(decision.group.pgid, `reaped (${decision.rule})`);
    else
        deps.ledger.markReported(decision.group.pgid, decision.rule);
}
