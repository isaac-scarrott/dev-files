export declare const TAG = "scheduled-task";
/** The message metadata key the wake carries so a desktop card can render it. Only the server side writes it. */
export declare const WAKE_KEY = "scheduledTask";
export interface Wake {
    readonly id: string;
    readonly name: string;
    readonly prompt: string;
    /** The slot this run was meant for, epoch ms. */
    readonly scheduled: number;
    /** How late it is, ms. */
    readonly lateMs: number;
    readonly recurring: boolean;
}
/** The task text with the name, id and slot as attributes. Name and body are escaped so neither can close the tag or forge another. */
export declare function wrap(wake: Pick<Wake, "id" | "name" | "prompt" | "scheduled">): string;
/** Framing outside the tags: where this came from and how little authority it carries. */
export declare function trailer(wake: Pick<Wake, "lateMs" | "recurring">, lateAfterMs: number): string;
export declare function deliver(wake: Wake, lateAfterMs: number): string;
export declare function wakeMetadata(wake: Wake, kind: string, firedAt: number): {
    scheduledTask: {
        id: string;
        name: string;
        kind: string;
        scheduled: number;
        firedAt: number;
        lateMs: number;
        text: string;
    };
};
