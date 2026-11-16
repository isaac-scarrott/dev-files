import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Plugin } from "@opencode/plugin";
import { parseOptions } from "./options.js";
import { Inbox } from "./rpc.js";
import { answerAsk, dismissAsk, emptyFile, mergeAsk, parseFile } from "./store.js";
const TOOL = "ask_isaac";
const FILE = "asks.json";
/**
 * The asks file. Every location runs its own instance of this plugin, all writing the same file, so reads and writes go
 * through one chain kept on `globalThis` (as the notification hub is) rather than one per instance.
 */
const CHAIN = Symbol.for("opencode-plugins.inbox.v1");
/** Runs `run` after every earlier read-modify-write of the file, in this process. */
function serialized(run) {
    const holder = globalThis;
    const chain = (holder[CHAIN] ??= { tail: Promise.resolve() });
    const started = chain.tail.then(run, run);
    chain.tail = started.then(() => undefined, () => undefined);
    return started;
}
/** `$XDG_DATA_HOME/opencode/inbox/asks.json`, or `~/.local/share/opencode/inbox/asks.json`. */
export function asksPath() {
    const data = process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share");
    return path.join(data, "opencode", "inbox", FILE);
}
async function readInbox(file) {
    try {
        return parseFile(JSON.parse(await readFile(file, "utf8")));
    }
    catch {
        return emptyFile();
    }
}
async function writeInbox(file, inbox) {
    await mkdir(path.dirname(file), { recursive: true });
    // Atomic: a reader (another location, the GUI through RPC) sees the old file or the new one, never half of each.
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(inbox, undefined, 2)}\n`);
    await rename(temp, file);
}
/** A session's root: itself, or its highest ancestor. Bounded, so a broken parent cycle still ends. */
async function rootOf(ctx, sessionID) {
    let current = sessionID;
    const seen = new Set();
    for (let depth = 0; depth < 32; depth++) {
        if (seen.has(current))
            return current;
        seen.add(current);
        const info = await ctx.session.get({ sessionID: current }).catch(() => undefined);
        const parent = info?.parentID;
        if (parent === undefined)
            return current;
        current = String(parent);
    }
    return current;
}
const clock = (at) => new Date(at).toTimeString().slice(0, 5);
function toolText(outcome) {
    const record = outcome.record;
    if (outcome.type === "new") {
        return `Added to Isaac's inbox as #${record.id}. Do not ask again in any form; the answer arrives as an <inbox-answer> message.`;
    }
    if (outcome.type === "answered")
        return record.answer ?? "Isaac answered this already.";
    return `Already in Isaac's inbox as #${record.id} (asked ${record.asks} times since ${clock(record.createdAt)}). Do not ask again in any form; the answer arrives as an <inbox-answer> message.`;
}
const answerMessage = (record, answer) => `<inbox-answer>\nYou asked: "${record.question}"\nIsaac answered: "${answer}"\n</inbox-answer>`;
const dismissedMessage = (record) => `<inbox-answer>\nYou asked: "${record.question}"\nIsaac dismissed it without an answer. Do not ask it again in any form.\n</inbox-answer>`;
const DESCRIPTION = [
    "Puts a question in Isaac's inbox: the call returns at once, so no turn waits on it, and Isaac's answer arrives later as a new message in this session wrapped in an <inbox-answer> tag.",
    "Ask Isaac only through question, question_background or ask_isaac, never in prose. Re-asking is merged: a question already in the inbox is counted, not added again.",
    "Use question or question_background instead when the ask is a choice, or when you need the answer before you can continue.",
].join(" ");
const toolInput = {
    type: "object",
    properties: {
        question: { type: "string", minLength: 1, description: "The complete question, in one or two sentences" },
        options: { type: "array", items: { type: "string" }, description: "Choices to offer, if any" },
        ref: { type: "string", description: "A stable name for this ask, so the same ref asked from any session is one item" },
        blocking: { type: "boolean", description: "Whether you stop at this ask and wait for it (default true)" },
    },
    required: ["question"],
    additionalProperties: false,
};
const plugin = Plugin.define({
    id: "inbox",
    async setup(ctx) {
        const options = parseOptions(ctx.options);
        const file = asksPath();
        const rememberMs = options.rememberAnsweredH * 3_600_000;
        /** Reads the file, lets `change` rewrite it, and writes it back inside the shared chain. */
        const update = (change) => serialized(async () => {
            const inbox = await readInbox(file);
            const result = change(inbox);
            await writeInbox(file, inbox);
            return result;
        });
        const deliver = async (record, text, description) => {
            await ctx.session.synthetic({ sessionID: record.session, text, description, delivery: "queue" });
        };
        const rpc = await ctx.rpc.register(Inbox, {
            list: async () => ({ asks: (await readInbox(file)).asks.filter((record) => record.answeredAt === undefined && record.dismissedAt === undefined).map(toView) }),
            answer: async (input) => {
                const { id, answer } = input;
                const text = answer.trim();
                if (!text)
                    return { ok: false };
                const record = await update((inbox) => answerAsk(inbox, id, text, Date.now()));
                if (!record)
                    return { ok: false };
                await deliver(record, answerMessage(record, text), "Inbox question answered");
                await rpc.events.emit("changed", { id });
                return { ok: true };
            },
            dismiss: async (input) => {
                const { id } = input;
                const record = await update((inbox) => dismissAsk(inbox, id, Date.now()));
                if (!record)
                    return { ok: false };
                await deliver(record, dismissedMessage(record), "Inbox question dismissed");
                await rpc.events.emit("changed", { id });
                return { ok: true };
            },
        });
        await ctx.tool.transform((editor) => {
            editor.add({
                name: TOOL,
                description: DESCRIPTION,
                input: toolInput,
                async execute(input, toolCtx) {
                    const { question, options: choices, ref, blocking = true } = input;
                    const session = toolCtx.sessionID;
                    const root = await rootOf(ctx, session);
                    const outcome = await update((inbox) => mergeAsk(inbox, {
                        question,
                        options: choices,
                        ref,
                        blocking,
                        session,
                        root,
                        now: Date.now(),
                        rememberMs,
                    }));
                    await rpc.events.emit("changed", { id: outcome.record.id }).catch(() => undefined);
                    return { content: toolText(outcome) };
                },
            });
        });
        return () => undefined;
    },
});
function toView(record) {
    return {
        id: record.id,
        session: record.session,
        root: record.root,
        question: record.question,
        ...(record.options !== undefined ? { options: [...record.options] } : {}),
        ...(record.ref !== undefined ? { ref: record.ref } : {}),
        blocking: record.blocking,
        createdAt: record.createdAt,
        lastAskedAt: record.lastAskedAt,
        asks: record.asks,
    };
}
export default plugin;
//# sourceMappingURL=server.js.map