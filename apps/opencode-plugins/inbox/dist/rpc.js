import { Rpc } from "@opencode/plugin/rpc";
const answer = {
    type: "object",
    properties: { id: { type: "number" }, answer: { type: "string" } },
    required: ["id", "answer"],
    additionalProperties: false,
};
const id = {
    type: "object",
    properties: { id: { type: "number" } },
    required: ["id"],
    additionalProperties: false,
};
const reply = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
};
/** One pending `ask_isaac`, for the panel. */
const ask = {
    type: "object",
    properties: {
        id: { type: "number" },
        session: { type: "string" },
        root: { type: "string" },
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        ref: { type: "string" },
        blocking: { type: "boolean" },
        createdAt: { type: "number" },
        lastAskedAt: { type: "number" },
        asks: { type: "number" },
    },
    required: ["id", "session", "root", "question", "blocking", "createdAt", "lastAskedAt", "asks"],
    additionalProperties: false,
};
/**
 * The server half owns the asks file; the GUI half reads the waiting ones and answers or dismisses them here. The answer is
 * delivered into the asking session by the server, so the window need not stay open.
 */
export const Inbox = Rpc.define({
    id: "inbox",
    methods: {
        list: {
            input: { type: "object", properties: {}, additionalProperties: false },
            output: {
                type: "object",
                properties: { asks: { type: "array", items: ask } },
                required: ["asks"],
                additionalProperties: false,
            },
        },
        answer: { input: answer, output: reply },
        dismiss: { input: id, output: reply },
    },
    events: {
        changed: {
            schema: { type: "object", properties: { id: { type: "number" } }, additionalProperties: false },
        },
    },
});
//# sourceMappingURL=rpc.js.map