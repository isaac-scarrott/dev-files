import type { Question } from "./rpc.js";
/** The message delivered back into the session once every question has an answer. */
export declare function answeredText(questions: readonly Question[], answers: readonly (readonly string[])[]): string;
/** The message delivered when the user closes the dialog without answering. */
export declare function dismissedText(questions: readonly Question[]): string;
