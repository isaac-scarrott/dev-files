/**
 * What this server half tells the user, as an RPC event named `notify`. The `notifications` plugin reads
 * every `rpc.<id>.notify` event and decides whether to toast, mark or stay quiet; without it the event is unheard and
 * nothing changes. The shape is the hub's (`native-ui/src/notify-contract.ts`); it is spelled out here because a server
 * bundle does not import across packages.
 */
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