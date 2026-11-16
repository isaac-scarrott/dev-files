/** `lstart` has one-second resolution and the event crosses a couple of milliseconds. */
export const START_SLACK_MS = 2000;
/** The pty daemon the host spawns tool shells under: `<cache>/opencode-pty daemon --runtime-dir …`. */
export function isPtyDaemon(command) {
    return /(^|\/)opencode-pty daemon(\s|$)/.test(command);
}
function childOfService(proc, snapshot, servicePid) {
    if (proc.ppid === servicePid)
        return true;
    const parent = snapshot.byPid.get(proc.ppid);
    return parent !== undefined && parent.ppid === servicePid && isPtyDaemon(parent.command);
}
/**
 * The shell's own command line. 2.3.0's shell tool publishes the pid, and the shell usually *is* the last command
 * (`bash -c 'sleep 30'` execs sleep: ps shows `sleep 30`), and a nested `sh -c '…'` loses its quotes when bash re-parses
 * it before the exec (`ps` shows `sh -c sleep 300 & echo ok`). The pid, the parent and the start time carry the identity;
 * the text only has to agree with one of the two shapes once quotes and spacing are normalised.
 */
function normalize(text) {
    return text.replace(/['"]/g, "").replace(/\s+/g, " ").trim();
}
/**
 * A shell that has already exited shows as a zombie before its parent reaps it: ps prints `<defunct>` or `(bash)` and the
 * argv is gone. With the host's own pid, that is still the shell (a leftover's group is worth tracking); without a pid
 * there is nothing to identify it by.
 */
const UNREADABLE = /^(?:<defunct>|\([A-Za-z0-9._-]+\))$/;
function sameArgv(proc, created) {
    if (UNREADABLE.test(proc.command.trim()))
        return created.pid !== undefined;
    const command = normalize(created.command);
    if (normalize(proc.command) === command)
        return true;
    if (created.shell !== undefined)
        return normalize(proc.command) === normalize(`${created.shell} -c ${created.command}`);
    return normalize(proc.command).endsWith(` -c ${command}`);
}
/**
 * `shell.created` → the process group it runs in. One candidate only: the leader (pid == pgid) of a group the service
 * spawned (directly or through its pty daemon), with the same argv and a start time within two seconds. No candidate, or
 * more than one (identical commands started together), means the group is not tracked: a wrong pgid would kill
 * someone else's work, and an untracked `&` server costs a leftover, not a wrong kill.
 */
export function matchShell(created, snapshot, service, exclude = new Set()) {
    const candidates = snapshot.procs.filter((proc) => proc.uid === service.uid &&
        proc.pgid === proc.pid &&
        !exclude.has(proc.pgid) &&
        (created.pid === undefined || proc.pid === created.pid) &&
        childOfService(proc, snapshot, service.pid) &&
        sameArgv(proc, created) &&
        Math.abs(proc.start * 1000 - created.started) <= START_SLACK_MS);
    if (candidates.length === 0) {
        const near = snapshot.procs.filter((proc) => created.pid !== undefined && proc.pid === created.pid);
        return { state: "none", reason: near.length === 0 ? "the shell is already gone" : "pid, parent, argv and start time do not agree" };
    }
    if (candidates.length > 1)
        return { state: "ambiguous", pids: candidates.map((proc) => proc.pid) };
    const leader = candidates[0];
    return { state: "matched", match: { pgid: leader.pgid, leaderPid: leader.pid, leaderStart: leader.start } };
}
