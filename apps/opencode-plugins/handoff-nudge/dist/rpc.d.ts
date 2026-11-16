/** The GUI and the server plugin are separate processes; the server owns the state and the GUI reads and acts on it here. */
export declare const HandoffNudge: {
    readonly id: "handoff-nudge";
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
                    /** False for a subagent, another location's session or a model the options do not name. */
                    readonly available: {
                        readonly type: "boolean";
                    };
                    /** The last measured context, in tokens. */
                    readonly context: {
                        readonly type: "number";
                    };
                    /** The highest tier fired and not re-armed; 0 for none. */
                    readonly tier: {
                        readonly type: "number";
                    };
                    /** The tier the user dismissed with "Not now". */
                    readonly dismissed: {
                        readonly type: "number";
                    };
                };
                readonly required: readonly ["available", "context", "tier", "dismissed"];
                readonly additionalProperties: false;
            };
        };
        readonly handoff: {
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
                    readonly queued: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["queued"];
                readonly additionalProperties: false;
            };
        };
        readonly dismiss: {
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
                    readonly dismissed: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["dismissed"];
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
        /** One per tier, through the `notifications` hub: a mark, never a toast. */
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
