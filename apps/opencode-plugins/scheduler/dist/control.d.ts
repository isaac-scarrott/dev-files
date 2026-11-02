import type { Hub } from "./hub.js";
/** The handlers behind the desktop row's Cancel button. A task belongs to the session it wakes, and only that session's row may cancel it. */
export declare function scheduleControl(hub: Pick<Hub, "list" | "cancel">): {
    active: (input: {
        ids: readonly string[];
    }) => Promise<{
        ids: string[];
    }>;
    cancel: (input: {
        id: string;
        sessionID: string;
    }) => Promise<{
        cancelled: boolean;
    }>;
};
