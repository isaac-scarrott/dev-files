import type { Monitors } from "./manager.js";
/** One monitor as the composer chip lists it: a name and numbers, never a command or output. */
export interface MonitorItem {
    readonly id: string;
    readonly name: string;
    readonly state: "running" | "waiting" | "paused";
    readonly events: number;
    readonly maxEvents?: number;
    readonly expiresAt: number;
    readonly nextRearmAt?: number;
}
/** The handlers behind the desktop row's Stop button and the composer chip. A monitor belongs to one session, and only that session's row may stop it. */
export declare function monitorControl(monitors: Pick<Monitors, "list" | "stop">): {
    running: (input: {
        ids: readonly string[];
    }) => Promise<{
        ids: string[];
    }>;
    list: (input: {
        sessionID: string;
    }) => Promise<{
        items: MonitorItem[];
    }>;
    stop: (input: {
        id: string;
        sessionID: string;
    }) => Promise<{
        stopped: boolean;
    }>;
};
