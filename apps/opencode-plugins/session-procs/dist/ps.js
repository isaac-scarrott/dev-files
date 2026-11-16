import { execFile } from "node:child_process";
/**
 * One `ps` call for everything this plugin decides. `-ww` keeps long command lines whole, and every field is a
 * single token except `lstart` (five) and `command` (the rest), so a line parses left to right.
 */
export const PS_ARGS = ["-axww", "-o", "pid=,ppid=,pgid=,uid=,stat=,lstart=,time=,command="];
const LINE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s?(.*)$/;
/** `[[dd-]hh:]mm:ss[.cc]` as ps prints it, in seconds. */
export function cpuSeconds(text) {
    const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text);
    if (!match)
        return undefined;
    return Number(match[1] ?? 0) * 86_400 + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4]);
}
export function parsePs(text, at) {
    const procs = [];
    const byPid = new Map();
    const groups = new Map();
    for (const line of text.split("\n")) {
        if (line.trim() === "")
            continue;
        const match = LINE.exec(line);
        // A command line with a newline in it spills over; the continuation matches nothing and is skipped.
        if (!match)
            continue;
        const start = Math.round(Date.parse(match[6]) / 1000);
        const cpu = cpuSeconds(match[7]);
        if (!Number.isFinite(start) || cpu === undefined)
            continue;
        const proc = {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            pgid: Number(match[3]),
            uid: Number(match[4]),
            zombie: match[5].startsWith("Z"),
            start,
            cpu,
            command: match[8] ?? "",
        };
        procs.push(proc);
        byPid.set(proc.pid, proc);
        groups.set(proc.pgid, [...(groups.get(proc.pgid) ?? []), proc]);
    }
    return { at, procs, byPid, byPgid: groups };
}
/** The real thing: one `ps` per call, injectable so every rule can be tested without spawning anything. */
export function readPs(uid = process.getuid?.() ?? -1) {
    return () => new Promise((resolve, reject) => {
        const at = Date.now();
        execFile("/bin/ps", [...PS_ARGS], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
            if (error)
                reject(error);
            else
                resolve(parsePs(stdout, at));
        });
    });
}
/** The live (non-zombie) processes of one group, and of the escapees that left it, as this snapshot sees them. */
export function liveProcs(snapshot, pgid, startedAt, uid, escapees = []) {
    const floor = Math.floor(startedAt / 1000) - 1;
    const found = (snapshot.byPgid.get(pgid) ?? []).filter((proc) => proc.uid === uid && proc.start >= floor && !proc.zombie);
    for (const pid of escapees) {
        const proc = snapshot.byPid.get(pid);
        if (proc && proc.uid === uid && proc.start >= floor && !proc.zombie && !found.includes(proc))
            found.push(proc);
    }
    return found;
}
