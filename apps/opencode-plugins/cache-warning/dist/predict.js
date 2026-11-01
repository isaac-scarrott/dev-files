/** A tier read longer ago than this before the step cannot be trusted to still apply (the 1 hour tier plus slack). */
export const LEARNED_WINDOW_MS = 65 * 60_000;
const TIER_MS = { "5m": 5 * 60_000, "1h": 60 * 60_000 };
/** The learned tier's lifetime when it comes from a write at or shortly before the step, else the configured one. */
export function ttlFor(config, anchor, learned) {
    if (!learned || anchor - learned.at > LEARNED_WINDOW_MS)
        return config.ttlMs;
    return TIER_MS[learned.ttl];
}
/** Epoch milliseconds of a timestamp the host may hand over as a number, a Date or a string. */
export function millis(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : undefined;
    if (value instanceof Date)
        return value.getTime();
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    if (value && typeof value === "object" && "epochMillis" in value)
        return millis(value.epochMillis);
}
/** The size the context ring shows: every token the last step read, wrote or produced. */
export function contextSize(tokens) {
    return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}
/**
 * The cache is touched when a step's request starts, not when its reply ends, so the step's creation is the anchor;
 * the first streamed and the completed timestamps are the fallbacks for a message that lacks it.
 */
export function touched(message) {
    return millis(message.time?.created) ?? millis(message.time?.streamed) ?? millis(message.time?.completed);
}
/**
 * The composer reports the model's default variant as undefined, a stored message as "default" (or empty): one choice.
 */
export function variantOf(variant) {
    return variant && variant !== "default" ? variant : "";
}
/** A model id without a leading `provider/`, which some sources write and others leave out. */
export function bareId(id, providerID) {
    return id.startsWith(`${providerID}/`) ? id.slice(providerID.length + 1) : id;
}
/**
 * What the next prompt will cost in cache terms, read from the tail of the conversation: the latest assistant step
 * with usage is the last measure (the host's context ring reads the same step) and the time anchor. A step without
 * usage that has ended (a failed one) made no cache call to count and is passed over; one still running means a
 * request is in flight and silences the warning. A prompt after the measured step also silences it, as does a reply
 * under way, except a completed compaction.
 */
export function forecast(input) {
    const messages = input.messages;
    let compacted = false;
    let step;
    // Only the tail is read, so a long conversation neither costs a scan nor subscribes to every message.
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (!message)
            continue;
        if (message.type === "user")
            return {};
        if (message.type === "compaction" && message.status === "completed")
            compacted = true;
        if (message.type !== "assistant")
            continue;
        if (!message.tokens) {
            if (millis(message.time?.completed) === undefined)
                return {};
            continue;
        }
        step = message;
        break;
    }
    const tokens = step?.tokens;
    if (!step || !tokens)
        return {};
    const size = contextSize(tokens);
    if (size < input.config.minTokens)
        return {};
    if (compacted)
        return { notice: { kind: "compacted" } };
    // A provider that never reported cache use gives no basis for a claim about its cache.
    if (tokens.cache.read + tokens.cache.write === 0)
        return {};
    const at = touched(step);
    if (at === undefined)
        return {};
    const expiresAt = at + ttlFor(input.config, at, input.learned);
    if (input.now >= expiresAt)
        return { notice: { kind: "expired", tokens: size } };
    const next = input.selection;
    const model = step.model;
    if (next && model) {
        const changed = next.providerID !== model.providerID ||
            bareId(next.modelID, next.providerID) !== bareId(model.id, model.providerID) ||
            variantOf(next.variant) !== variantOf(model.variant);
        if (changed)
            return { notice: { kind: "model", tokens: size } };
    }
    return { expiresAt };
}
/** The latest assistant step with usage: the one the forecast reads, and so the point at which a learned tier is stale. */
export function measuredStep(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.type === "assistant" && message.tokens)
            return message;
    }
}
/** The host's number style for token counts: compact, whole, lower case ("180k"). */
export function humanize(count, locale) {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 0 })
        .format(count)
        .toLocaleLowerCase(locale);
}
//# sourceMappingURL=predict.js.map