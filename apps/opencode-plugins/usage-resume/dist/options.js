import os from "node:os";
import path from "node:path";
export const DEFAULTS = {
    prompt: "Continue.",
    marginMs: 60_000,
    tickMs: 30_000,
    maxAttempts: 3,
    retryBackoffMs: 5 * 60_000,
    maxWaitMs: 8 * 86_400_000,
    staggerMs: 1_000,
    authDir: path.join(os.homedir(), ".cli-proxy-api"),
    snapshotPath: path.join(os.homedir(), "Library", "Caches", "NotchUsage", "snapshot.json"),
    notices: true,
    includeChildren: false,
};
const NAME = "usage-resume option";
function seconds(raw, key, fallbackMs, min) {
    const value = raw[key];
    if (value === undefined)
        return fallbackMs;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min)
        throw new Error(`${NAME} ${key} must be a number of at least ${min}`);
    return value * 1000;
}
function text(raw, key, fallback, allowEmpty) {
    const value = raw[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== "string" || (!allowEmpty && !value.trim()))
        throw new Error(`${NAME} ${key} must be a${allowEmpty ? "" : " non-empty"} string`);
    return value;
}
function flag(raw, key, fallback) {
    const value = raw[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== "boolean")
        throw new Error(`${NAME} ${key} must be a boolean`);
    return value;
}
/** Durations are given in seconds (`marginSeconds`, `tickSeconds`, …) and held in ms. */
export function parseOptions(raw = {}) {
    const attempts = raw.maxAttempts;
    if (attempts !== undefined && (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 1)) {
        throw new Error(`${NAME} maxAttempts must be a positive integer`);
    }
    return {
        prompt: text(raw, "prompt", DEFAULTS.prompt, false),
        marginMs: seconds(raw, "marginSeconds", DEFAULTS.marginMs, 0),
        tickMs: seconds(raw, "tickSeconds", DEFAULTS.tickMs, 1),
        maxAttempts: attempts ?? DEFAULTS.maxAttempts,
        retryBackoffMs: seconds(raw, "retryBackoffSeconds", DEFAULTS.retryBackoffMs, 0),
        maxWaitMs: seconds(raw, "maxWaitHours", DEFAULTS.maxWaitMs / 3600, 1) * 3600,
        staggerMs: seconds(raw, "staggerSeconds", DEFAULTS.staggerMs, 0),
        authDir: text(raw, "authDir", DEFAULTS.authDir, false),
        snapshotPath: text(raw, "snapshotPath", DEFAULTS.snapshotPath, true),
        notices: flag(raw, "notices", DEFAULTS.notices),
        includeChildren: flag(raw, "includeChildren", DEFAULTS.includeChildren),
    };
}
//# sourceMappingURL=options.js.map