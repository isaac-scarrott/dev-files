import { Rpc } from "@opencode/plugin/rpc";
const request = {
    type: "object",
    properties: { requestID: { type: "string" } },
    required: ["requestID"],
    additionalProperties: false,
};
const reply = {
    type: "object",
    properties: { accepted: { type: "boolean" } },
    required: ["accepted"],
    additionalProperties: false,
};
export const Blindfold = Rpc.define({
    id: "blindfold",
    methods: {
        submit: {
            input: {
                type: "object",
                properties: {
                    requestID: { type: "string" },
                    value: { type: "string", minLength: 1 },
                },
                required: ["requestID", "value"],
                additionalProperties: false,
            },
            output: reply,
        },
        ack: { input: request, output: reply },
        cancel: { input: request, output: reply },
    },
    events: {
        requested: {
            schema: {
                type: "object",
                properties: {
                    requestID: { type: "string" },
                    sessionID: { type: "string" },
                    name: { type: "string" },
                    reason: { type: "string" },
                },
                required: ["requestID", "sessionID", "name", "reason"],
                additionalProperties: false,
            },
        },
        resolved: { schema: request },
    },
});
//# sourceMappingURL=rpc.js.map