/** The GUI asks for the cache tier of a session; the server reads Claude Code's transcript and answers with numbers only. */
export declare const CacheTtl: {
    readonly id: "cache-warning";
    readonly methods: {
        readonly learn: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly sessionID: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    /** `native.sessionID` of the session's messages, when the caller has it. */
                    readonly nativeSessionID: {
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
                    /** The tier of the newest request that wrote cache; absent when unknown. */
                    readonly ttl: {
                        readonly type: "string";
                        readonly enum: readonly ["5m", "1h"];
                    };
                    /** Epoch ms that request was logged. */
                    readonly at: {
                        readonly type: "number";
                    };
                };
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {};
};
