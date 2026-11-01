import os from "node:os";
import path from "node:path";
export function defaultLogDir() {
    const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
    return path.join(base, "opencode", "scheduler");
}
export const DEFAULTS = {
    maxSchedules: 50,
    minIntervalSeconds: 60,
    loopMaxFires: 10,
    loopWindowMinutes: 60,
    tickSeconds: 30,
    lateSeconds: 90,
    scope: "tree",
    logDir: defaultLogDir(),
};
function integer(raw, key) {
    const value = raw[key];
    if (value === undefined)
        return DEFAULTS[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
        throw new Error(`scheduler option ${key} must be a positive integer`);
    return value;
}
export function parseOptions(raw = {}) {
    const scope = raw.scope ?? DEFAULTS.scope;
    if (scope !== "tree" && scope !== "project" && scope !== "all")
        throw new Error('scheduler option scope must be "tree", "project" or "all"');
    const logDir = raw.logDir ?? DEFAULTS.logDir;
    if (typeof logDir !== "string" || !logDir)
        throw new Error("scheduler option logDir must be a path");
    return {
        maxSchedules: integer(raw, "maxSchedules"),
        minIntervalSeconds: integer(raw, "minIntervalSeconds"),
        loopMaxFires: integer(raw, "loopMaxFires"),
        loopWindowMinutes: integer(raw, "loopWindowMinutes"),
        tickSeconds: integer(raw, "tickSeconds"),
        lateSeconds: integer(raw, "lateSeconds"),
        scope,
        logDir,
    };
}
//# sourceMappingURL=options.js.map