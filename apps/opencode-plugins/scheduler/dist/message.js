/**
 * The scheduled run a user message is, or undefined for anything else. The scheduler stamps `metadata.scheduledTask` on the
 * prompts it sends (with the real task text), so a message a user typed with the same tags stays the user's bubble and nothing
 * has to be parsed out of the wrapper.
 */
export function scheduledOf(message) {
    if (message.type !== "user")
        return undefined;
    const stamp = message.metadata?.scheduledTask;
    if (!stamp || typeof stamp !== "object")
        return undefined;
    const { id, name, kind, text } = stamp;
    if (typeof id !== "string" || typeof name !== "string" || typeof text !== "string")
        return undefined;
    if (kind !== "once" && kind !== "every" && kind !== "cron")
        return undefined;
    return { id, name, kind, text };
}
//# sourceMappingURL=message.js.map