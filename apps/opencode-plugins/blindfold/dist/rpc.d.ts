import type { Field } from "./fields.js";
export declare const Blindfold: {
    readonly id: "blindfold";
    readonly methods: {
        readonly submit: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly values: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                };
                readonly required: readonly ["requestID", "values"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly accepted: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["accepted"];
                readonly additionalProperties: false;
            };
        };
        readonly ack: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["requestID"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly accepted: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["accepted"];
                readonly additionalProperties: false;
            };
        };
        readonly list: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly requests: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly properties: {
                                readonly requestID: {
                                    readonly type: "string";
                                };
                                readonly sessionID: {
                                    readonly type: "string";
                                };
                                readonly callID: {
                                    readonly type: "string";
                                };
                                readonly messageID: {
                                    readonly type: "string";
                                };
                                readonly reason: {
                                    readonly type: "string";
                                };
                                readonly fields: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly name: {
                                                readonly type: "string";
                                            };
                                            readonly label: {
                                                readonly type: "string";
                                            };
                                            readonly kind: {
                                                readonly enum: readonly ["text", "email", "secret"];
                                            };
                                            readonly masked: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly required: readonly ["name", "label", "kind", "masked"];
                                        readonly additionalProperties: false;
                                    };
                                };
                            };
                            readonly required: readonly ["requestID", "sessionID", "callID", "messageID", "reason", "fields"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["requests"];
                readonly additionalProperties: false;
            };
        };
        readonly cancel: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["requestID"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly accepted: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["accepted"];
                readonly additionalProperties: false;
            };
        };
    };
    readonly events: {
        readonly requested: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly sessionID: {
                        readonly type: "string";
                    };
                    readonly callID: {
                        readonly type: "string";
                    };
                    readonly messageID: {
                        readonly type: "string";
                    };
                    readonly reason: {
                        readonly type: "string";
                    };
                    readonly fields: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly properties: {
                                readonly name: {
                                    readonly type: "string";
                                };
                                readonly label: {
                                    readonly type: "string";
                                };
                                readonly kind: {
                                    readonly enum: readonly ["text", "email", "secret"];
                                };
                                readonly masked: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly required: readonly ["name", "label", "kind", "masked"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["requestID", "sessionID", "callID", "messageID", "reason", "fields"];
                readonly additionalProperties: false;
            };
        };
        readonly resolved: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly status: {
                        readonly enum: readonly ["submitted", "cancelled", "timeout", "unavailable"];
                    };
                };
                readonly required: readonly ["requestID", "status"];
                readonly additionalProperties: false;
            };
        };
    };
};
export type SecretResolved = {
    requestID: string;
    status: "submitted" | "cancelled" | "timeout" | "unavailable";
};
export type SecretRequested = {
    requestID: string;
    sessionID: string;
    callID: string;
    messageID: string;
    reason: string;
    fields: Field[];
};
