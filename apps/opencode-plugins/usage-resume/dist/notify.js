export const notificationSchema = {
    type: "object",
    properties: {
        kind: { type: "string" },
        title: { type: "string" },
        severity: { type: "string" },
        body: { type: "string" },
        key: { type: "string" },
        persistent: { type: "boolean" },
        at: { type: "number" },
        target: { type: "object", properties: { session: { type: "string" } }, required: ["session"], additionalProperties: false },
    },
    required: ["kind", "title"],
    additionalProperties: true,
};
//# sourceMappingURL=notify.js.map