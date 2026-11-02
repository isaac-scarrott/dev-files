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
    readonly events: {};
};
