export declare const optionSchema: {
    readonly type: "object";
    readonly properties: {
        readonly label: {
            readonly type: "string";
            readonly description: "Display text (1-5 words, concise)";
        };
        readonly description: {
            readonly type: "string";
            readonly description: "Explanation of choice";
        };
    };
    readonly required: readonly ["label", "description"];
    readonly additionalProperties: false;
};
export declare const questionSchema: {
    readonly type: "object";
    readonly properties: {
        readonly question: {
            readonly type: "string";
            readonly description: "Complete question";
        };
        readonly header: {
            readonly type: "string";
            readonly description: "Very short label (max 30 chars)";
        };
        readonly options: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly properties: {
                    readonly label: {
                        readonly type: "string";
                        readonly description: "Display text (1-5 words, concise)";
                    };
                    readonly description: {
                        readonly type: "string";
                        readonly description: "Explanation of choice";
                    };
                };
                readonly required: readonly ["label", "description"];
                readonly additionalProperties: false;
            };
            readonly description: "Available choices";
        };
        readonly multiple: {
            readonly type: "boolean";
            readonly description: "Allow selecting multiple choices";
        };
    };
    readonly required: readonly ["question", "header", "options"];
    readonly additionalProperties: false;
};
export declare const QuestionBackground: {
    readonly id: "question-async";
    readonly methods: {
        readonly claim: {
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
        readonly pending: {
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
                                readonly messageID: {
                                    readonly type: "string";
                                };
                                readonly callID: {
                                    readonly type: "string";
                                };
                                readonly questions: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly question: {
                                                readonly type: "string";
                                                readonly description: "Complete question";
                                            };
                                            readonly header: {
                                                readonly type: "string";
                                                readonly description: "Very short label (max 30 chars)";
                                            };
                                            readonly options: {
                                                readonly type: "array";
                                                readonly items: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly label: {
                                                            readonly type: "string";
                                                            readonly description: "Display text (1-5 words, concise)";
                                                        };
                                                        readonly description: {
                                                            readonly type: "string";
                                                            readonly description: "Explanation of choice";
                                                        };
                                                    };
                                                    readonly required: readonly ["label", "description"];
                                                    readonly additionalProperties: false;
                                                };
                                                readonly description: "Available choices";
                                            };
                                            readonly multiple: {
                                                readonly type: "boolean";
                                                readonly description: "Allow selecting multiple choices";
                                            };
                                        };
                                        readonly required: readonly ["question", "header", "options"];
                                        readonly additionalProperties: false;
                                    };
                                };
                            };
                            readonly required: readonly ["requestID", "sessionID", "messageID", "callID", "questions"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["requests"];
                readonly additionalProperties: false;
            };
        };
        readonly failed: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly reason: {
                        readonly type: "string";
                    };
                };
                readonly required: readonly ["requestID", "reason"];
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
        readonly asked: {
            readonly schema: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly sessionID: {
                        readonly type: "string";
                    };
                    readonly messageID: {
                        readonly type: "string";
                    };
                    readonly callID: {
                        readonly type: "string";
                    };
                    readonly questions: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "object";
                            readonly properties: {
                                readonly question: {
                                    readonly type: "string";
                                    readonly description: "Complete question";
                                };
                                readonly header: {
                                    readonly type: "string";
                                    readonly description: "Very short label (max 30 chars)";
                                };
                                readonly options: {
                                    readonly type: "array";
                                    readonly items: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly label: {
                                                readonly type: "string";
                                                readonly description: "Display text (1-5 words, concise)";
                                            };
                                            readonly description: {
                                                readonly type: "string";
                                                readonly description: "Explanation of choice";
                                            };
                                        };
                                        readonly required: readonly ["label", "description"];
                                        readonly additionalProperties: false;
                                    };
                                    readonly description: "Available choices";
                                };
                                readonly multiple: {
                                    readonly type: "boolean";
                                    readonly description: "Allow selecting multiple choices";
                                };
                            };
                            readonly required: readonly ["question", "header", "options"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["requestID", "sessionID", "messageID", "callID", "questions"];
                readonly additionalProperties: false;
            };
        };
    };
};
export type Option = {
    label: string;
    description: string;
};
export type Question = {
    question: string;
    header: string;
    options: Option[];
    multiple?: boolean;
};
export type Asked = {
    requestID: string;
    sessionID: string;
    messageID: string;
    callID: string;
    questions: Question[];
};
