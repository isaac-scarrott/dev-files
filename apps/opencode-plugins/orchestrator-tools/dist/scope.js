const MAX_HOPS = 32;
export const METADATA_KEY = "orchestrator";
export function marker(info) {
    const value = info.metadata?.[METADATA_KEY];
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const creator = value.creator;
    return typeof creator === "string" ? value : undefined;
}
export function running(info) {
    const { busy, idle } = info.time;
    return busy !== undefined && (idle === undefined || busy > idle);
}
export function describe(info) {
    return {
        id: info.id,
        title: info.title,
        parentID: info.parentID,
        agent: info.agent,
        model: info.model ? `${info.model.providerID}/${info.model.id}` : undefined,
        directory: info.location.directory,
        state: running(info) ? "running" : "idle",
        outcome: info.outcome,
        created: info.time.created,
        updated: info.time.updated,
    };
}
/** Parent, grandparent, … of a session. Stops at a missing parent or a cycle. */
export async function ancestors(host, info) {
    const chain = [];
    const seen = new Set([info.id]);
    let current = info;
    while (current.parentID && chain.length < MAX_HOPS && !seen.has(current.parentID)) {
        let parent;
        try {
            parent = await host.session.get({ sessionID: current.parentID });
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
export async function reachable(host, caller, target, scope) {
    if (target.id === caller.id)
        return true;
    if (marker(target)?.creator === caller.id)
        return true;
    if (caller.parentID !== undefined && target.parentID === caller.parentID)
        return true;
    if (target.parentID !== undefined) {
        const chain = await ancestors(host, target);
        if (chain.some((a) => a.id === caller.id || marker(a)?.creator === caller.id))
            return true;
    }
    return scope === "project" && target.projectID === caller.projectID;
}
//# sourceMappingURL=scope.js.map