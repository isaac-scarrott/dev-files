// How two asks are the same ask. A call's `ref` names one thing across every session; without one, the question's text is
// the identity, but only within the family of the session that asked it: two projects asking "continue?" are not one ask.
/** Lowercase, punctuation removed, whitespace collapsed: what the text key is computed from. */
export function normalise(text) {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}
/** FNV-1a, 8 hex digits: a short, stable key for a normalised question, with no dependency. */
export function hash(text) {
    let value = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        value ^= text.charCodeAt(index);
        value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value.toString(16).padStart(8, "0");
}
export function askIdentity(input) {
    const ref = input.ref?.trim();
    if (ref)
        return { key: `ref:${ref}`, scope: "all", ref };
    return { key: `text:${hash(normalise(input.question))}`, scope: "root" };
}
/** Whether a stored ask is the same ask as this identity asked from `root`. */
export function sameAsk(stored, identity, root) {
    if (stored.key !== identity.key)
        return false;
    return identity.scope === "all" || stored.root === root;
}
//# sourceMappingURL=merge.js.map