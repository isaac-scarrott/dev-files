import { Rpc } from "@opencode/plugin/rpc";
/**
 * What this server half tells the user, as an RPC event named `notify`. The `notifications` plugin reads every
 * `rpc.<id>.notify` event and decides whether to toast, mark or stay quiet; without it the event is unheard. The shape is
 * the hub's (`native-ui/src/notify-contract.ts`), spelled out because a server bundle does not import across packages.
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
export const ShellHandoff = Rpc.define({
    id: "shell-handoff",
    methods: {},
    events: {
        notify: { schema: notificationSchema },
    },
});
