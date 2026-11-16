import { Rpc } from "@opencode/plugin/rpc";
/**
 * `notify`: the alerts hub's generic channel. The `notifications` plugin reads every `rpc.<id>.notify` event; without
 * it the event is unheard and the session notice still arrives. The shape is the hub's
 * (`native-ui/src/notify-contract.ts`), spelled out because a server bundle does not import across packages.
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
export const SessionProcs = Rpc.define({
    id: "session-procs",
    methods: {},
    events: {
        notify: { schema: notificationSchema },
    },
});
