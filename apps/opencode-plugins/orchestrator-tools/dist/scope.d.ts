import type { Host, SessionInfo } from "./host.js";
export declare const METADATA_KEY = "orchestrator";
export interface Marker {
    readonly creator: string;
    readonly mode: "child" | "independent";
    readonly depth: number;
}
export declare function marker(info: SessionInfo): Marker | undefined;
export declare function running(info: SessionInfo): boolean;
export interface SessionSummary {
    readonly id: string;
    readonly title?: string;
    readonly parentID?: string;
    readonly agent?: string;
    readonly model?: string;
    readonly directory: string;
    readonly state: "running" | "idle";
    readonly outcome?: "succeeded" | "failed" | "interrupted";
    readonly created: number;
    readonly updated: number;
}
export declare function describe(info: SessionInfo): SessionSummary;
/** Parent, grandparent, … of a session. Stops at a missing parent or a cycle. */
export declare function ancestors(host: Host, info: SessionInfo): Promise<SessionInfo[]>;
export declare function reachable(host: Host, caller: SessionInfo, target: SessionInfo, scope: "tree" | "project"): Promise<boolean>;
