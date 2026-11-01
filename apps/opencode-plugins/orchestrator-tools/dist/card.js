/** The message metadata key `send_message` sets and the desktop card reads. Only the server side writes it. */
export const PEER_KEY = "peerMessage";
/** The sender behind a user message the plugin delivered, or undefined for a message the user typed. */
export function peerOf(message) {
    if (message.type !== "user")
        return undefined;
    const value = message.metadata?.[PEER_KEY];
    if (!value || typeof value !== "object")
        return undefined;
    const { sessionID, title, ref, text } = value;
    if (typeof sessionID !== "string" || typeof title !== "string" || typeof ref !== "string" || typeof text !== "string")
        return undefined;
    return { sessionID, title, ref, text };
}
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;
/**
 * Message text for the host's Markdown renderer, which passes inline HTML through: a peer writing `<div>` or `<b>`
 * would lose the tag or format text. Outside code fences and code spans `&` and `<` become entities, so they show as typed;
 * code is left alone because Markdown shows its content literally.
 */
export function escapeMarkup(text) {
    return text
        .split(CODE)
        .map((part, index) => (index % 2 === 1 ? part : part.replace(/&/g, "&amp;").replace(/</g, "&lt;")))
        .join("");
}
//# sourceMappingURL=card.js.map