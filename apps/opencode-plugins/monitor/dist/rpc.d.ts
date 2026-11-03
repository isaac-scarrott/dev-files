/** What the desktop asks of the monitor plugin: which of these monitors still run, what runs for a session, and stop one. Ids, names, numbers and booleans only. */
export declare const MonitorControl: {
    readonly id: "monitor";
    readonly methods: {
        readonly running: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly ids: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly maxItems: 200;
                    };
                };
                readonly required: readonly ["ids"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ids: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                };
                readonly required: readonly ["ids"];
                readonly additionalProperties: false;
            };
        };
        /** The monitors that wake one session, for the composer chip. */
        readonly list: {
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
                    readonly items: {
                        readonly type: "array";
                        readonly maxItems: 200;
                        readonly items: {
                            readonly type: "object";
                            readonly properties: {
                                readonly id: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly name: {
                                    readonly type: "string";
                                };
                                readonly state: {
                                    readonly type: "string";
                                    readonly enum: readonly ["running", "waiting", "paused"];
                                };
                                readonly events: {
                                    readonly type: "number";
                                };
                                readonly maxEvents: {
                                    readonly type: "number";
                                };
                                readonly expiresAt: {
                                    readonly type: "number";
                                };
                                readonly nextRearmAt: {
                                    readonly type: "number";
                                };
                            };
                            readonly required: readonly ["id", "name", "state", "events", "expiresAt"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["items"];
                readonly additionalProperties: false;
            };
        };
        readonly stop: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly sessionID: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                };
                readonly required: readonly ["id", "sessionID"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly stopped: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["stopped"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {
        /** Something the user should hear about: a monitor that crashed or stopped waking its session. */
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
