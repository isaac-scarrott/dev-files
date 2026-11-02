export function parseRunState(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const v = value;
    const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
    const aliveAt = num(v.aliveAt);
    if (aliveAt === undefined)
        return undefined;
    return {
        seq: Math.max(0, num(v.seq) ?? 0),
        restartCount: Math.max(0, num(v.restartCount) ?? 0),
        aliveAt,
        events: Math.max(0, Math.floor(num(v.events) ?? 0)),
        ...(num(v.lastEventAt) === undefined ? {} : { lastEventAt: num(v.lastEventAt) }),
        ...(num(v.lastRearmAt) === undefined ? {} : { lastRearmAt: num(v.lastRearmAt) }),
        ...(num(v.nextRearmAt) === undefined ? {} : { nextRearmAt: num(v.nextRearmAt) }),
    };
}
/** One sentence naming the window the service was away, from the last time it was known alive. */
export function downtimeWindow(aliveAt, now) {
    const to = new Date(now).toISOString();
    return aliveAt === undefined
        ? `It was down until ${to}; when it went down is unknown (no last-alive time was recorded).`
        : `It was down from ${new Date(aliveAt).toISOString()} to ${to}.`;
}
//# sourceMappingURL=state.js.map