/** What the desktop asks of the scheduler: which of these repeating tasks are still scheduled, what is scheduled for a session, and cancel one. Ids, names, numbers and booleans only. */
export declare const ScheduleControl: {
    readonly id: "scheduler";
    readonly methods: {
        readonly active: {
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
        /** The tasks that wake one session, for the composer chip. */
        readonly pending: {
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
                                readonly kind: {
                                    readonly type: "string";
                                    readonly enum: readonly ["once", "every", "cron"];
                                };
                                readonly spec: {
                                    readonly type: "string";
                                };
                                readonly paused: {
                                    readonly type: "boolean";
                                };
                                readonly nextRun: {
                                    readonly type: "number";
                                };
                                readonly runs: {
                                    readonly type: "number";
                                };
                                readonly maxRuns: {
                                    readonly type: "number";
                                };
                            };
                            readonly required: readonly ["id", "name", "kind", "spec", "paused", "nextRun", "runs"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["items"];
                readonly additionalProperties: false;
            };
        };
        readonly cancel: {
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
                    readonly cancelled: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["cancelled"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {};
};
