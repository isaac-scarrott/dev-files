import type { AccountView, Overview as ManagerOverview, Tool } from "./manager.js";
import type { Probe } from "./probe.js";
import type { Provider } from "./store.js";
/**
 * The settings page's calls to the server part. Credentials travel only in `add` and `update` (`secrets`) and in `unlock`
 * (`password`), once, into the keychain or a CLI's stdin; nothing here echoes one, and no reply or event carries one.
 */
export declare const Providers: {
    readonly id: "blindfold-providers";
    readonly methods: {
        readonly overview: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly fresh: {
                        readonly type: "boolean";
                    };
                };
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly accounts: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                        };
                    };
                    readonly tools: {
                        readonly type: "object";
                    };
                    readonly confirmed: {
                        readonly type: "object";
                    };
                    readonly file: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["accounts", "tools", "confirmed", "file"];
                readonly additionalProperties: false;
            };
        };
        readonly add: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly provider: {
                        readonly enum: readonly ["1password", "bitwarden"];
                    };
                    readonly settings: {
                        readonly type: "object";
                    };
                    readonly secrets: {
                        readonly type: "object";
                        readonly properties: {
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
                        readonly additionalProperties: false;
                    };
                };
                readonly required: readonly ["provider", "settings", "secrets"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly update: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly settings: {
                        readonly type: "object";
                    };
                    readonly secrets: {
                        readonly type: "object";
                        readonly properties: {
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
                        readonly additionalProperties: false;
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
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly remove: {
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
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly confirm: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly key: {
                        readonly enum: readonly ["opAppIntegrationOff"];
                    };
                    readonly value: {
                        readonly type: "boolean";
                    };
                };
                readonly required: readonly ["key", "value"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly lock: {
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
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly unlock: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly password: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["id", "password"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly test: {
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
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
                    };
                };
                readonly required: readonly ["ok"];
                readonly additionalProperties: false;
            };
        };
        readonly verify: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly itemId: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["id", "itemId"];
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly properties: {
                    readonly ok: {
                        readonly type: "boolean";
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly probe: {
                        readonly type: "object";
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
                readonly properties: {};
                readonly additionalProperties: false;
            };
        };
    };
};
export type Overview = ManagerOverview;
export type { AccountView, Probe, Provider, Tool };
export type Reply = {
    ok: boolean;
    error?: string;
    id?: string;
    probe?: Probe;
};
