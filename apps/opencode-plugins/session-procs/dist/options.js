import os from "node:os";
import path from "node:path";
export const defaultDir = () => path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "opencode", "session-procs");
export const OFF_FILE = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode", "session-procs.off");
export const DEFAULTS = {
    enabled: true,
    dryRun: true,
    scanSeconds: 15,
    subagentIdleMinutes: 10,
    runawayCpu: 90,
    runawayMinutes: 10,
    orphanKillMinutes: 30,
    killGraceSeconds: 5,
    guardKill: true,
    dir: defaultDir(),
};
function integer(raw, key, min) {
    const value = raw[key];
    if (value === undefined)
        return DEFAULTS[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min)
        throw new Error(`session-procs option ${key} must be an integer of at least ${min}`);
    return value;
}
function flag(raw, key) {
    const value = raw[key];
    if (value === undefined)
        return DEFAULTS[key];
    if (typeof value !== "boolean")
        throw new Error(`session-procs option ${key} must be true or false`);
    return value;
}
export function parseOptions(raw = {}) {
    const dir = raw.dir ?? DEFAULTS.dir;
    if (typeof dir !== "string" || dir === "")
        throw new Error("session-procs option dir must be a path");
    return {
        enabled: flag(raw, "enabled"),
        dryRun: flag(raw, "dryRun"),
        scanSeconds: integer(raw, "scanSeconds", 1),
        subagentIdleMinutes: integer(raw, "subagentIdleMinutes", 0),
        runawayCpu: integer(raw, "runawayCpu", 1),
        runawayMinutes: integer(raw, "runawayMinutes", 0),
        orphanKillMinutes: integer(raw, "orphanKillMinutes", 0),
        killGraceSeconds: integer(raw, "killGraceSeconds", 0),
        guardKill: flag(raw, "guardKill"),
        dir,
    };
}
