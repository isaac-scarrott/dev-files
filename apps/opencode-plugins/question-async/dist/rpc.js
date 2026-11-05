import { Rpc } from "@opencode/plugin/rpc";
export const optionSchema = {
    type: "object",
    properties: {
        label: { type: "string", description: "Display text (1-5 words, concise)" },
        description: { type: "string", description: "Explanation of choice" },
    },
    required: ["label", "description"],
    additionalProperties: false,
};
export const questionSchema = {
    type: "object",
    properties: {
        question: { type: "string", description: "Complete question" },
        header: { type: "string", description: "Very short label (max 30 chars)" },
        options: { type: "array", items: optionSchema, description: "Available choices" },
        multiple: { type: "boolean", description: "Allow selecting multiple choices" },
    },
    required: ["question", "header", "options"],
    additionalProperties: false,
};
const reply = {
    type: "object",
    properties: { accepted: { type: "boolean" } },
    required: ["accepted"],
    additionalProperties: false,
};
const requestID = {
    type: "object",
    properties: { requestID: { type: "string" } },
    required: ["requestID"],
    additionalProperties: false,
};
const asked = {
    type: "object",
    properties: {
        requestID: { type: "string" },
        sessionID: { type: "string" },
        messageID: { type: "string" },
        callID: { type: "string" },
        questions: { type: "array", items: questionSchema },
    },
    required: ["requestID", "sessionID", "messageID", "callID", "questions"],
    additionalProperties: false,
};
export const QuestionBackground = Rpc.define({
    id: "question-async",
    methods: {
        // The first window to claim a request creates its form; any other window is refused, so one question is one form.
        claim: { input: requestID, output: reply },
        // Requests no window has claimed yet, for a window that opened after the tool call.
        pending: {
            input: { type: "object", properties: {}, additionalProperties: false },
            output: {
                type: "object",
                properties: { requests: { type: "array", items: asked } },
                required: ["requests"],
                additionalProperties: false,
            },
        },
        // The form could not be created; the agent is told instead of waiting forever.
        failed: {
            input: {
                type: "object",
                properties: { requestID: { type: "string" }, reason: { type: "string" } },
                required: ["requestID", "reason"],
                additionalProperties: false,
            },
            output: reply,
        },
    },
    events: {
        // A question_background tool call, for a window to turn into the host's own question form.
        asked: { schema: asked },
    },
});
