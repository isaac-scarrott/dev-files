/**
 * What this server half tells the user, as an RPC event named `notify`. The `notifications` plugin reads every
 * `rpc.<id>.notify` event and decides whether to toast, mark or stay quiet; without it the event is unheard. The shape is
 * the hub's (`native-ui/src/notify-contract.ts`), spelled out because a server bundle does not import across packages.
 */
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
export declare const ShellHandoff: {
    readonly id: "shell-handoff";
    readonly methods: {};
    readonly events: {
        readonly notify: {
            readonly schema: {
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
        };
    };
};
