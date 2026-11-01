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
//# sourceMappingURL=card.js.map