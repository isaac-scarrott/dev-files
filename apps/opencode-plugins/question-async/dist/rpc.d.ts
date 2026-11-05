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
    };
    readonly required: readonly ["question", "header", "options"];
    readonly additionalProperties: false;
};
export declare const QuestionBackground: {
    readonly id: "question-async";
    readonly methods: {
        readonly answer: {
            readonly input: {
                readonly type: "object";
                readonly properties: {
                    readonly requestID: {
                        readonly type: "string";
                    };
                    readonly answers: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly required: readonly ["requestID", "answers"];
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
        readonly dismiss: {
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
                            };
                            readonly required: readonly ["question", "header", "options"];
                            readonly additionalProperties: false;
                        };
                    };
                };
                readonly required: readonly ["requestID", "sessionID", "questions"];
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
};
export type Asked = {
    requestID: string;
    sessionID: string;
    questions: Question[];
};
