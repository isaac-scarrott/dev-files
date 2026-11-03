/** The GUI and the server plugin are separate processes; the server owns the state and the GUI reads and writes it here. */
export declare const UsageResume: {
    readonly id: "usage-resume";
    readonly methods: {
        readonly get: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                };
                readonly required: readonly ["sessionID"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                    /** False for a subagent session: it is never resumed, so the toggle is not offered. */
                    readonly available: {
                        readonly type: "boolean";
                    };
                    /** The session's last run stopped at a usage limit and it has not moved on since. */
                    readonly limited: {
                        readonly type: "boolean";
                    };
                    /** Epoch ms of the next check while the session is waiting to resume. */
                    readonly resumesAt: {
                        readonly type: "number";
                    };
                };
                readonly required: readonly ["enabled", "available", "limited"];
                readonly additionalProperties: false;
            };
        };
        readonly set: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["sessionID", "enabled"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["enabled"];
                readonly additionalProperties: false;
            };
        };
        readonly getDefault: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["enabled"];
                readonly additionalProperties: false;
            };
        };
        readonly setDefault: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["enabled"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["enabled"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {
        readonly changed: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                    };
                };
                readonly additionalProperties: false;
            };
        };
        /** What the user should hear: a limit was hit, the resume moved. Read by the GUI half or the `notifications` plugin. */
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
