import type { MessageInfo } from "./host.js";
export interface MessageSummary {
    readonly id: string;
    readonly type: string;
    readonly created: number;
    readonly text?: string;
    readonly tools?: readonly {
        name: string;
        status: string;
    }[];
    readonly error?: string;
    readonly truncated?: boolean;
}
export declare function clip(text: string, max: number): {
    text: string;
    truncated: boolean;
};
export declare function summarize(message: MessageInfo, maxChars: number): MessageSummary;
/** Text of the last assistant message that has any. */
export declare function finalText(messages: readonly MessageInfo[]): string | undefined;
