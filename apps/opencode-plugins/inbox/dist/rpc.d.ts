/**
 * The server half owns the asks file; the GUI half reads the waiting ones and answers or dismisses them here. The answer is
 * delivered into the asking session by the server, so the window need not stay open.
 */
export declare const Inbox: {
    readonly id: "inbox";
    readonly methods: {
        readonly list: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly asks: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly properties: {
                                readonly id: {
                                    readonly type: "number";
                                };
                                readonly session: {
                                    readonly type: "string";
                                };
                                readonly root: {
                                    readonly type: "string";
                                };
                                readonly question: {
                                    readonly type: "string";
                                };
                                readonly options: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "string";
                                    };
                                };
                                readonly ref: {
                                    readonly type: "string";
                                };
                                readonly blocking: {
                                    readonly type: "boolean";
                                };
                                readonly createdAt: {
                                    readonly type: "number";
                                };
                                readonly lastAskedAt: {
                                    readonly type: "number";
                                };
                                readonly asks: {
                                    readonly type: "number";
                                };
                            };
                            readonly required: readonly ["id", "session", "root", "question", "blocking", "createdAt", "lastAskedAt", "asks"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["asks"];
                readonly additionalProperties: false;
            };
        };
        readonly answer: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "number";
                    };
                    readonly answer: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["id", "answer"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly dismiss: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "number";
                    };
                };
                readonly required: readonly ["id"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {
        readonly changed: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "number";
                    };
                };
                readonly additionalProperties: false;
            };
        };
    };
};
export type AskView = {
    id: number;
    session: string;
    root: string;
    question: string;
    options?: string[];
    ref?: string;
    blocking: boolean;
    createdAt: number;
    lastAskedAt: number;
    asks: number;
};
