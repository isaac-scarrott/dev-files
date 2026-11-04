import type { Field } from "./fields.js";
import type { Source } from "./broker.js";
import type { SavedRule } from "./rules.js";
import type { AuditEntry } from "./audit.js";
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
                    readonly picks: {
                        readonly type: "object";
                        readonly additionalProperties: {
                            readonly type: "string";
                        };
                    };
                    readonly remember: {
                        readonly type: "boolean";
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
        readonly unlock: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly account: {
                        readonly type: "string";
                    };
                    readonly input: {
                        readonly type: "object";
                        readonly properties: {
                            readonly method: {
                                readonly enum: readonly ["masterPassword", "serviceAccount", "apiKey"];
                            };
                            readonly password: {
                                readonly type: "string";
                            };
                            readonly token: {
                                readonly type: "string";
                            };
                            readonly clientId: {
                                readonly type: "string";
                            };
                            readonly clientSecret: {
                                readonly type: "string";
                            };
                        };
                        readonly required: readonly ["method"];
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["requestID", "account", "input"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly accepted: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["accepted"];
                readonly additionalProperties: false;
            };
        };
        readonly overview: {
            readonly input: {
                readonly type: "object";
                readonly properties: {};
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly rules: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                        };
                    };
                    readonly accounts: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                        };
                    };
                    readonly audit: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                        };
                    };
                };
                readonly required: readonly ["rules", "accounts", "audit"];
                readonly additionalProperties: false;
            };
        };
        readonly revoke: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["id"];
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
        readonly lock: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly account: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["account"];
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
                                readonly origin: {
                                    readonly type: "string";
                                };
                                readonly via: {
                                    readonly enum: readonly ["get", "fill"];
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
                                                readonly enum: readonly ["text", "email", "secret", "otp"];
                                            };
                                            readonly masked: {
                                                readonly type: "boolean";
                                            };
                                            readonly source: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly state: {
                                                        readonly enum: readonly ["choose", "unavailable"];
                                                    };
                                                    readonly candidates: {
                                                        readonly type: "array";
                                                        readonly items: {
                                                            readonly type: "object";
                                                            readonly properties: {
                                                                readonly key: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly account: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly label: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly state: {
                                                                    readonly enum: readonly ["ready", "locked"];
                                                                };
                                                                readonly methods: {
                                                                    readonly type: "array";
                                                                    readonly items: {
                                                                        readonly enum: readonly ["masterPassword", "serviceAccount", "apiKey"];
                                                                    };
                                                                };
                                                                readonly item: {
                                                                    readonly type: "object";
                                                                    readonly properties: {
                                                                        readonly id: {
                                                                            readonly type: "string";
                                                                        };
                                                                        readonly title: {
                                                                            readonly type: "string";
                                                                        };
                                                                    };
                                                                    readonly required: readonly ["id", "title"];
                                                                    readonly additionalProperties: false;
                                                                };
                                                                readonly covered: {
                                                                    readonly type: "boolean";
                                                                };
                                                                readonly confirm: {
                                                                    readonly type: "boolean";
                                                                };
                                                            };
                                                            readonly required: readonly ["key", "account", "label", "state", "methods", "covered"];
                                                            readonly additionalProperties: false;
                                                        };
                                                    };
                                                    readonly selected: {
                                                        readonly type: "string";
                                                    };
                                                    readonly hint: {
                                                        readonly type: "string";
                                                    };
                                                };
                                                readonly required: readonly ["state", "candidates"];
                                                readonly additionalProperties: false;
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
                    readonly origin: {
                        readonly type: "string";
                    };
                    readonly via: {
                        readonly enum: readonly ["get", "fill"];
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
                                    readonly enum: readonly ["text", "email", "secret", "otp"];
                                };
                                readonly masked: {
                                    readonly type: "boolean";
                                };
                                readonly source: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly state: {
                                            readonly enum: readonly ["choose", "unavailable"];
                                        };
                                        readonly candidates: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly key: {
                                                        readonly type: "string";
                                                    };
                                                    readonly account: {
                                                        readonly type: "string";
                                                    };
                                                    readonly label: {
                                                        readonly type: "string";
                                                    };
                                                    readonly state: {
                                                        readonly enum: readonly ["ready", "locked"];
                                                    };
                                                    readonly methods: {
                                                        readonly type: "array";
                                                        readonly items: {
                                                            readonly enum: readonly ["masterPassword", "serviceAccount", "apiKey"];
                                                        };
                                                    };
                                                    readonly item: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly id: {
                                                                readonly type: "string";
                                                            };
                                                            readonly title: {
                                                                readonly type: "string";
                                                            };
                                                        };
                                                        readonly required: readonly ["id", "title"];
                                                        readonly additionalProperties: false;
                                                    };
                                                    readonly covered: {
                                                        readonly type: "boolean";
                                                    };
                                                    readonly confirm: {
                                                        readonly type: "boolean";
                                                    };
                                                };
                                                readonly required: readonly ["key", "account", "label", "state", "methods", "covered"];
                                                readonly additionalProperties: false;
                                            };
                                        };
                                        readonly selected: {
                                            readonly type: "string";
                                        };
                                        readonly hint: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly required: readonly ["state", "candidates"];
                                    readonly additionalProperties: false;
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
        readonly updated: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
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
                                    readonly enum: readonly ["text", "email", "secret", "otp"];
                                };
                                readonly masked: {
                                    readonly type: "boolean";
                                };
                                readonly source: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly state: {
                                            readonly enum: readonly ["choose", "unavailable"];
                                        };
                                        readonly candidates: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly key: {
                                                        readonly type: "string";
                                                    };
                                                    readonly account: {
                                                        readonly type: "string";
                                                    };
                                                    readonly label: {
                                                        readonly type: "string";
                                                    };
                                                    readonly state: {
                                                        readonly enum: readonly ["ready", "locked"];
                                                    };
                                                    readonly methods: {
                                                        readonly type: "array";
                                                        readonly items: {
                                                            readonly enum: readonly ["masterPassword", "serviceAccount", "apiKey"];
                                                        };
                                                    };
                                                    readonly item: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly id: {
                                                                readonly type: "string";
                                                            };
                                                            readonly title: {
                                                                readonly type: "string";
                                                            };
                                                        };
                                                        readonly required: readonly ["id", "title"];
                                                        readonly additionalProperties: false;
                                                    };
                                                    readonly covered: {
                                                        readonly type: "boolean";
                                                    };
                                                    readonly confirm: {
                                                        readonly type: "boolean";
                                                    };
                                                };
                                                readonly required: readonly ["key", "account", "label", "state", "methods", "covered"];
                                                readonly additionalProperties: false;
                                            };
                                        };
                                        readonly selected: {
                                            readonly type: "string";
                                        };
                                        readonly hint: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly required: readonly ["state", "candidates"];
                                    readonly additionalProperties: false;
                                };
                            };
                            readonly required: readonly ["name", "label", "kind", "masked"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["requestID", "fields"];
                readonly additionalProperties: false;
            };
        };
        readonly changed: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {};
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
export type RequestedField = Field & {
    source?: Source;
};
export type SecretRequested = {
    requestID: string;
    sessionID: string;
    callID: string;
    messageID: string;
    reason: string;
    /** The page the secrets are for, when the agent named one. */
    origin?: string;
    via?: "get" | "fill";
    fields: RequestedField[];
};
export type AccountState = {
    id: string;
    label: string;
    kind: string;
    state: "unlocked" | "locked" | "unavailable";
    reason?: string;
    expiresAt?: number;
};
export type Overview = {
    rules: SavedRule[];
    accounts: AccountState[];
    audit: AuditEntry[];
};
