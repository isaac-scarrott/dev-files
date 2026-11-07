import os from "node:os";
import path from "node:path";
export const DEFAULTS = {
    maxMonitors: 40,
    maxPerSession: 5,
    ttlMinutes: 1440,
    maxEventsPerHour: 200,
    minRearmMinutes: 1,
    maxLinesPerWake: 50,
    maxLineChars: 2000,
    maxBufferBytes: 65_536,
    killGraceSeconds: 5,
    logDir: path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "opencode", "monitor"),
};
function integer(raw, key) {
    const value = raw[key];
    if (value === undefined)
        return DEFAULTS[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
        throw new Error(`monitor option ${key} must be a positive integer`);
    return value;
}
export function parseOptions(raw = {}) {
    const logDir = raw.logDir ?? DEFAULTS.logDir;
    if (typeof logDir !== "string" || logDir === "")
        throw new Error("monitor option logDir must be a path");
    return {
        maxMonitors: integer(raw, "maxMonitors"),
        maxPerSession: integer(raw, "maxPerSession"),
        ttlMinutes: integer(raw, "ttlMinutes"),
        maxEventsPerHour: integer(raw, "maxEventsPerHour"),
        minRearmMinutes: integer(raw, "minRearmMinutes"),
        maxLinesPerWake: integer(raw, "maxLinesPerWake"),
        maxLineChars: integer(raw, "maxLineChars"),
        maxBufferBytes: integer(raw, "maxBufferBytes"),
        killGraceSeconds: integer(raw, "killGraceSeconds"),
        logDir,
    };
}
//# sourceMappingURL=options.js.map