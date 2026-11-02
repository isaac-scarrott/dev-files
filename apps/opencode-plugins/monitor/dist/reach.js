const MARKER_KEY = "orchestrator";
const MAX_HOPS = 32;
/** Id of the session that created `info` through orchestrator-tools, when it was started as an independent session. */
function creator(info) {
    const value = info.metadata?.[MARKER_KEY];
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const id = value.creator;
    return typeof id === "string" ? id : undefined;
}
async function ancestors(sessions, info) {
    const chain = [];
    const seen = new Set([info.id]);
    let current = info;
    while (current.parentID && chain.length < MAX_HOPS && !seen.has(current.parentID)) {
        let parent;
        try {
            parent = await sessions.get({ sessionID: current.parentID });
        }
        catch {
            break;
        }
        chain.push(parent);
        seen.add(parent.id);
        current = parent;
    }
    return chain;
}
export async function mayWake(sessions, caller, target) {
    if (target.id === caller.id || target.id === caller.parentID)
        return true;
    if (creator(target) === caller.id)
        return true;
    if (caller.parentID !== undefined && target.parentID === caller.parentID)
        return true;
    if (target.parentID === undefined)
        return false;
    const chain = await ancestors(sessions, target);
    return chain.some((a) => a.id === caller.id || creator(a) === caller.id);
}
//# sourceMappingURL=reach.js.map