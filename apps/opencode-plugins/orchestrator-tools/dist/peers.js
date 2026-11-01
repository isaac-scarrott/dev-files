import { PEER_KEY } from "./card.js";
import { marker } from "./scope.js";
export const TAG = "cross-session-message";
const REF_CHARS = 8;
export const refOf = (id) => id.slice(-REF_CHARS);
const escapeText = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nameOf = (info) => (info.title ?? "").replace(/\s+/g, " ").trim() || "untitled";
/** `name [ref]`: the address a peer is known by. */
export function label(info) {
    return `${nameOf(info)} [${refOf(info.id)}]`;
}
/** The text the receiver sees. Title and body are escaped so neither can close the tag or forge another sender. */
export function wrap(from, text) {
    return `<${TAG} from="${escapeText(label(from)).replace(/"/g, "&quot;")}">${escapeText(text)}</${TAG}>`;
}
/** What the desktop plugin reads to draw the message as a peer card: set only here, so typed look-alike text stays the user's own. */
export function peerMetadata(from, text) {
    return { [PEER_KEY]: { sessionID: from.id, title: nameOf(from), ref: refOf(from.id), text } };
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