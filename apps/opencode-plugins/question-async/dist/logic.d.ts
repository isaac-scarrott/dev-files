import type { Question } from "./rpc.js";
export type FieldOption = {
    value: string;
    label: string;
    description?: string;
};
export type Field = {
    key: string;
    type: "string" | "multiselect";
    title: string;
    description: string;
    options: FieldOption[];
    custom: true;
};
/** The host's own `question` tool makes forms with this metadata; the dock and the attention mark key on it. */
export declare const FORM_TITLE = "Questions";
export declare const fieldKey: (index: number) => string;
/** One field per question, the same mapping the built-in `question` tool uses: header → title, question → description. */
export declare function toFields(questions: readonly Question[]): [Field, ...Field[]];
export type FormMetadata = {
    kind: "question";
    requestID: string;
    tool: {
        messageID: string;
        id: string;
    };
};
export declare function formMetadata(requestID: string, messageID: string, callID: string): FormMetadata;
/** A form answer ({q0: "Dark", q1: ["A", "B"]}) as one array of chosen labels or typed text per question, in order. */
export declare function answersFromForm(questions: readonly Question[], answer: Record<string, unknown>): string[][];
/** The message delivered back into the session once every question has an answer. */
export declare function answeredText(questions: readonly Question[], answers: readonly (readonly string[])[]): string;
/** The message delivered when the user dismisses the question without answering. */
export declare function dismissedText(questions: readonly Question[]): string;
/** The message delivered when no window could show the question. */
export declare function failedText(questions: readonly Question[], reason: string): string;
