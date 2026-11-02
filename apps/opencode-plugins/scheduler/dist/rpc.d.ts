/** What the desktop row asks of the scheduler: which of these repeating tasks are still scheduled, and cancel one. Ids and booleans only. */
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
