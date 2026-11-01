import { reachable } from "./scope.js";
const REF_CHARS = 8;
const LIST_LIMIT = 100;
export const refOf = (id) => id.slice(-REF_CHARS);
const nameOf = (info) => (info.title ?? "").replace(/\s+/g, " ").trim() || "untitled";
/** `name [ref]`: the address a session is known by, the same label orchestrate_list_peers shows. */
export function label(info) {
    return `${nameOf(info)} [${refOf(info.id)}]`;
}
/** Accepts `ref`, `title`, the whole `title [ref]` label, or a full session id. */
export function matches(info, query) {
    const q = query.trim();
    const ref = refOf(info.id);
    if (q === ref || q === info.id)
        return true;
    const bracket = /^(.*)\[([^\]]+)\]$/.exec(q);
    if (bracket)
        return bracket[2]?.trim() === ref;
    return (info.title ?? "").trim().toLowerCase() === q.toLowerCase();
}
async function candidates(host, me, scope) {
    const found = new Map([[me.id, me]]);
    const add = (list) => {
        for (const info of list)
            if (!found.has(info.id))
                found.set(info.id, info);
    };
    if (me.parentID !== undefined) {
        try {
            add([await host.session.get({ sessionID: me.parentID })]);
        }
        catch {
            // The parent is gone.
        }
        add((await host.session.list({ parentID: me.parentID, limit: LIST_LIMIT })).data);
    }
    add((await host.session.list({ parentID: me.id, limit: LIST_LIMIT })).data);
    if (scope === "project")
        add((await host.session.list({ project: me.projectID, limit: LIST_LIMIT })).data);
    if (scope === "all")
        add((await host.session.list({ limit: LIST_LIMIT })).data);
    return [...found.values()];
}
/** The session a task wakes: the caller by default, otherwise one found by ref, title, `title [ref]` or id within the caller's reach. */
export async function resolveTarget(host, me, query, scope) {
    const q = typeof query === "string" ? query.trim() : "";
    if (!q)
        return me;
    const hits = (await candidates(host, me, scope)).filter((s) => matches(s, q));
    if (hits.length === 1 && hits[0])
        return hits[0];
    if (hits.length > 1)
        throw new Error(`"${q}" matches ${hits.length} sessions; use one by its ref: ${hits.map(label).join(", ")}`);
    if (q.startsWith("ses")) {
        const target = await host.session.get({ sessionID: q }).catch(() => undefined);
        if (target) {
            if (!(await reachable(host, me, target, scope)))
                throw new Error(`Session ${q} is outside this session's reach`);
            return target;
        }
    }
    throw new Error(`No session matches "${q}". Use a session's ref, a unique title, or leave session out to wake this one.`);
}
//# sourceMappingURL=targets.js.map