import type { Hub } from "./hub.js";
/** One scheduled task as the composer chip lists it: a name, the schedule as written, and numbers; never the prompt. */
export interface ScheduleItem {
    readonly id: string;
    readonly name: string;
    readonly kind: "once" | "every" | "cron";
    readonly spec: string;
    readonly paused: boolean;
    readonly nextRun: number;
    readonly runs: number;
    readonly maxRuns?: number;
}
/** The handlers behind the desktop row's Cancel button and the composer chip. A task belongs to the session it wakes, and only that session's row may cancel it. */
export declare function scheduleControl(hub: Pick<Hub, "list" | "cancel">): {
    active: (input: {
        ids: readonly string[];
    }) => Promise<{
        ids: string[];
    }>;
    pending: (input: {
        sessionID: string;
    }) => Promise<{
        items: ScheduleItem[];
    }>;
    cancel: (input: {
        id: string;
        sessionID: string;
    }) => Promise<{
        cancelled: boolean;
    }>;
};
