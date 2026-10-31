export function clip(text, max) {
    if (text.length <= max)
        return { text, truncated: false };
    return { text: text.slice(0, Math.max(0, max - 1)) + "…", truncated: true };
}
function textOf(message) {
    if (message.type === "assistant") {
        return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
    }
    if ("text" in message && typeof message.text === "string")
        return message.text;
    return undefined;
}
export function summarize(message, maxChars) {
    const summary = {
        id: message.id,
        type: message.type,
        created: message.time.created,
    };
    const text = textOf(message);
    if (text) {
        const clipped = clip(text, maxChars);
        summary.text = clipped.text;
        if (clipped.truncated)
            summary.truncated = true;
    }
    if (message.type === "assistant") {
        const tools = message.content.flatMap((part) => (part.type === "tool" ? [{ name: part.name, status: part.state.status }] : []));
        if (tools.length)
            summary.tools = tools;
        if (message.error)
            summary.error = message.error.message;
    }
    return summary;
}
/** Text of the last assistant message that has any. */
export function finalText(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.type !== "assistant")
            continue;
        const text = textOf(message);
        if (text)
            return text;
    }
    return undefined;
}
//# sourceMappingURL=messages.js.map