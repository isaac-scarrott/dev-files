import { marker } from "./scope.js";
export const TAG = "cross-session-message";
const REF_CHARS = 8;
export const refOf = (id) => id.slice(-REF_CHARS);
const escapeText = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** `name [ref]`: the address a peer is known by. */
export function label(info) {
    const name = (info.title ?? "").replace(/\s+/g, " ").trim() || "untitled";
    return `${name} [${refOf(info.id)}]`;
}
/** The text the receiver sees. Title and body are escaped so neither can close the tag or forge another sender. */
export function wrap(from, text) {
    return `<${TAG} from="${escapeText(label(from)).replace(/"/g, "&quot;")}">${escapeText(text)}</${TAG}>`;
}
export function relation(me, other) {
    if (me.parentID === other.id)
        return "parent";
    if (other.parentID === me.id || marker(other)?.creator === me.id)
        return "child";
    if (me.parentID !== undefined && other.parentID === me.parentID)
        return "sibling";
    return "other";
}
/** Accepts `ref`, `title`, or the whole `title [ref]` label. */
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
//# sourceMappingURL=peers.js.map