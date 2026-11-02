import type { Monitors } from "./manager.js";
/** The handlers behind the desktop row's Stop button. A monitor belongs to one session, and only that session's row may stop it. */
export declare function monitorControl(monitors: Pick<Monitors, "list" | "stop">): {
    running: (input: {
        ids: readonly string[];
    }) => Promise<{
        ids: string[];
    }>;
    stop: (input: {
        id: string;
        sessionID: string;
    }) => Promise<{
        stopped: boolean;
    }>;
};
