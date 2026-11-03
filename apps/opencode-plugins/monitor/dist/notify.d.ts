/**
 * What this server half tells the user, as an RPC event named `notify`. The `notifications` plugin reads
 * every `rpc.<id>.notify` event and decides whether to toast, mark or stay quiet; without it the event is
 * unheard and nothing changes. The shape is the hub's (`native-ui/src/notify-contract.ts`); it is spelled out here because a
 * server bundle does not import across packages, and a test keeps the two in step.
 */
export interface Outgoing {
    readonly kind: "done" | "needs-you" | "error" | "info";
    readonly title: string;
    readonly severity?: "info" | "success" | "warning" | "error";
    readonly body?: string;
    readonly key?: string;
    readonly persistent?: boolean;
    /** The server half does not know the host's id for its own server; the hub supplies it. */
    readonly target?: {
        readonly session: string;
    };
    /** Server clock at the event; windows of one app share it to show a system notification once. */
    readonly at: number;
}
export type Notify = (notification: Outgoing) => void;
export declare const notificationSchema: {
    readonly type: "object";
    readonly properties: {
        readonly kind: {
            readonly type: "string";
        };
        readonly title: {
            readonly type: "string";
        };
        readonly severity: {
            readonly type: "string";
        };
        readonly body: {
            readonly type: "string";
        };
        readonly key: {
            readonly type: "string";
        };
        readonly persistent: {
            readonly type: "boolean";
        };
        readonly at: {
            readonly type: "number";
        };
        readonly target: {
            readonly type: "object";
            readonly properties: {
                readonly session: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["session"];
            readonly additionalProperties: false;
        };
    };
    readonly required: readonly ["kind", "title"];
    readonly additionalProperties: true;
};
