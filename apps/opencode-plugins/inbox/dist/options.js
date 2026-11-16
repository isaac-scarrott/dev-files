// Options from the plugin's `opencode.json` entry, for both halves.
export const DEFAULTS = {
    notifyEveryMin: 10,
    escalateMin: [15, 60],
    rememberAnsweredH: 24,
    reaskWeight: 30,
};
const NAME = "inbox option";
function minutes(raw, key, fallback, min) {
    const value = raw[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min)
        throw new Error(`${NAME} ${key} must be a number of at least ${min}`);
    return value;
}
function escalation(raw, key, fallback) {
    const value = raw[key];
    if (value === undefined)
        return [...fallback];
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item <= 0)) {
        throw new Error(`${NAME} ${key} must be a non-empty array of minutes`);
    }
    return [...value].sort((a, b) => a - b);
}
export function parseOptions(raw = {}) {
    return {
        notifyEveryMin: minutes(raw, "notifyEveryMin", DEFAULTS.notifyEveryMin, 1),
        escalateMin: escalation(raw, "escalateMin", DEFAULTS.escalateMin),
        rememberAnsweredH: minutes(raw, "rememberAnsweredH", DEFAULTS.rememberAnsweredH, 1),
        reaskWeight: minutes(raw, "reaskWeight", DEFAULTS.reaskWeight, 0),
    };
}
//# sourceMappingURL=options.js.map