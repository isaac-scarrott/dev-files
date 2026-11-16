export const DEFAULTS = {
    models: ["*opus*"],
    tiers: [200_000, 400_000, 700_000],
    coldWrite: 150_000,
};
const NAME = "handoff-nudge option";
function glob(text) {
    const source = text.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${source}$`, "i");
}
export function modelMatches(id, models) {
    if (id === undefined)
        return false;
    return models.some((pattern) => glob(pattern).test(id));
}
/** The options as written in `opencode.json`; tokens are counts and `models` are globs. */
export function parseOptions(raw = {}) {
    const models = raw.models;
    if (models !== undefined && (!Array.isArray(models) || models.length === 0 || models.some((m) => typeof m !== "string" || !m.trim()))) {
        throw new Error(`${NAME} models must be a non-empty array of model ids`);
    }
    const tiers = raw.tiers;
    if (tiers !== undefined &&
        (!Array.isArray(tiers) || tiers.length === 0 || tiers.some((t) => typeof t !== "number" || !Number.isFinite(t) || t <= 0))) {
        throw new Error(`${NAME} tiers must be a non-empty array of token counts`);
    }
    const coldWrite = raw.coldWrite;
    if (coldWrite !== undefined && (typeof coldWrite !== "number" || !Number.isFinite(coldWrite) || coldWrite < 0)) {
        throw new Error(`${NAME} coldWrite must be a token count`);
    }
    const sorted = [...(tiers ?? DEFAULTS.tiers)].sort((a, b) => a - b);
    return {
        models: models ?? DEFAULTS.models,
        tiers: sorted,
        coldWrite: coldWrite ?? DEFAULTS.coldWrite,
    };
}
//# sourceMappingURL=options.js.map