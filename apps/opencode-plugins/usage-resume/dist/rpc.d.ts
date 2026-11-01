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
                };
                readonly required: readonly ["enabled", "available"];
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
    };
};
