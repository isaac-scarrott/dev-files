import { askIdentity, sameAsk } from "./merge.js";
export const emptyFile = () => ({ version: 1, nextID: 1, asks: [] });
export const isPending = (record) => record.answeredAt === undefined && record.dismissedAt === undefined;
export const pendingAsks = (file) => file.asks.filter(isPending);
/**
 * Adds an ask, or counts it when the same ask waits or was answered recently: a pending item gains a re-ask and nothing
 * else, and an answered one keeps its answer so the tool can hand it straight back. Mutates `file` in place (it is the
 * caller's read-modify-write copy) and drops settled asks past `rememberMs`.
 */
export function mergeAsk(file, input) {
    const identity = askIdentity({ question: input.question, ref: input.ref });
    file.asks = file.asks.filter((record) => isPending(record) || input.now - (record.answeredAt ?? record.dismissedAt ?? 0) < input.rememberMs);
    for (const record of file.asks) {
        if (!sameAsk(record, identity, input.root))
            continue;
        if (isPending(record)) {
            const next = { ...record, asks: record.asks + 1, lastAskedAt: input.now };
            file.asks[file.asks.indexOf(record)] = next;
            return { type: "pending", record: next };
        }
        if (record.answeredAt !== undefined && input.now - record.answeredAt < input.rememberMs) {
            const next = { ...record, asks: record.asks + 1, lastAskedAt: input.now };
            file.asks[file.asks.indexOf(record)] = next;
            return { type: "answered", record: next };
        }
    }
    const record = {
        id: file.nextID,
        key: identity.key,
        scope: identity.scope,
        ...(identity.ref !== undefined ? { ref: identity.ref } : {}),
        root: input.root,
        session: input.session,
        question: input.question,
        ...(input.options !== undefined && input.options.length > 0 ? { options: input.options } : {}),
        blocking: input.blocking,
        createdAt: input.now,
        lastAskedAt: input.now,
        asks: 1,
    };
    file.nextID += 1;
    file.asks = [...file.asks, record];
    return { type: "new", record };
}
/** Marks a pending ask answered; the answer is what the tool returns for a re-ask within `rememberMs`. */
export function answerAsk(file, id, answer, now) {
    const record = file.asks.find((item) => item.id === id && isPending(item));
    if (!record)
        return undefined;
    const next = { ...record, answeredAt: now, answer };
    file.asks = file.asks.map((item) => (item.id === id ? next : item));
    return next;
}
/** Marks a pending ask dismissed: nothing waits for it any more, and the model is told so. */
export function dismissAsk(file, id, now) {
    const record = file.asks.find((item) => item.id === id && isPending(item));
    if (!record)
        return undefined;
    const next = { ...record, dismissedAt: now };
    file.asks = file.asks.map((item) => (item.id === id ? next : item));
    return next;
}
/** Reads whatever a file holds, keeping only well-formed records; a broken file starts empty rather than failing a tool call. */
export function parseFile(raw) {
    const input = typeof raw === "object" && raw !== null ? raw : {};
    const asks = Array.isArray(input.asks) ? input.asks.filter(isRecord).map(normaliseRecord).filter((record) => record !== undefined) : [];
    const stored = typeof input.nextID === "number" && Number.isInteger(input.nextID) && input.nextID > 0 ? input.nextID : 1;
    const nextID = Math.max(stored, asks.reduce((max, record) => Math.max(max, record.id), 0) + 1);
    return { version: 1, nextID, asks };
}
const isRecord = (value) => typeof value === "object" && value !== null;
const text = (value) => (typeof value === "string" && value.length > 0 ? value : undefined);
const count = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
function normaliseRecord(raw) {
    const id = count(raw.id);
    const key = text(raw.key);
    const root = text(raw.root);
    const session = text(raw.session);
    const question = text(raw.question);
    const createdAt = count(raw.createdAt);
    const lastAskedAt = count(raw.lastAskedAt);
    const asks = count(raw.asks);
    if (id === undefined || !key || !root || !session || !question || createdAt === undefined || lastAskedAt === undefined || asks === undefined)
        return undefined;
    const scope = raw.scope === "all" ? "all" : "root";
    const options = Array.isArray(raw.options) ? raw.options.filter((option) => typeof option === "string") : undefined;
    return {
        id,
        key,
        scope,
        ...(text(raw.ref) !== undefined ? { ref: text(raw.ref) } : {}),
        root,
        session,
        question,
        ...(options !== undefined && options.length > 0 ? { options } : {}),
        blocking: raw.blocking === true,
        createdAt,
        lastAskedAt,
        asks,
        ...(count(raw.answeredAt) !== undefined ? { answeredAt: count(raw.answeredAt) } : {}),
        ...(text(raw.answer) !== undefined ? { answer: text(raw.answer) } : {}),
        ...(count(raw.dismissedAt) !== undefined ? { dismissedAt: count(raw.dismissedAt) } : {}),
    };
}
//# sourceMappingURL=store.js.map