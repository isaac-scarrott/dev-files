import { Error as ToolError } from "@opencode/plugin/promise/tool";
import type { Host } from "./host.js";
import type { Options } from "./options.js";
import { type SessionSummary } from "./scope.js";
import { type MessageSummary } from "./messages.js";
import { type WaitResult } from "./wait.js";
export interface Caller {
    readonly sessionID: string;
    readonly agent: string;
    readonly messageID: string;
    readonly id: string;
    readonly signal?: AbortSignal;
    readonly progress?: (update: Record<string, unknown>) => Promise<void>;
}
export interface CreateSpec {
    readonly prompt: string;
    readonly title?: string;
    readonly directory?: string;
    readonly agent?: string;
    readonly model?: string;
    readonly mode?: "child" | "independent";
    readonly context?: string;
    readonly clientRequestId?: string;
}
export interface Created extends SessionSummary {
    readonly reused: boolean;
}
export interface SendInput {
    readonly sessionID: string;
    readonly text: string;
    readonly delivery?: "queue" | "steer";
    readonly clientRequestId?: string;
}
export interface ReadInput {
    readonly sessionID: string;
    readonly limit?: number;
    readonly offset?: number;
}
export interface WaitInput {
    readonly sessionIDs: readonly string[];
    readonly timeoutMs?: number;
    readonly mode?: "all" | "any";
}
export interface ListInput {
    readonly scope?: "children" | "siblings" | "project";
    readonly limit?: number;
}
export interface DelegateInput extends Omit<CreateSpec, "mode"> {
    readonly wait?: boolean;
    readonly timeoutMs?: number;
}
export interface WaitEntry extends WaitResult {
    readonly finalText?: string;
}
export declare const fail: (message: string, metadata?: Record<string, unknown>) => ToolError;
export declare class Orchestrator {
    private readonly host;
    private readonly options;
    constructor(host: Host, options: Options);
    createSessions(caller: Caller, input: {
        sessions: readonly CreateSpec[];
    }): Promise<{
        sessions: Created[];
    }>;
    sendMessage(caller: Caller, input: SendInput): Promise<{
        sessionID: string;
        messageID: string;
        delivery: "queue" | "steer";
    }>;
    readSession(caller: Caller, input: ReadInput): Promise<{
        session: SessionSummary;
        total: number;
        offset: number;
        messages: MessageSummary[];
        finalText: string | undefined;
        truncated: boolean;
    }>;
    waitForSessions(caller: Caller, input: WaitInput): Promise<{
        results: WaitEntry[];
        timedOut: boolean;
        aborted: boolean;
    }>;
    interruptSession(caller: Caller, input: {
        sessionID: string;
    }): Promise<{
        sessionID: string;
        interrupted: boolean;
    }>;
    listSessions(caller: Caller, input: ListInput): Promise<{
        sessions: SessionSummary[];
    }>;
    delegateTask(caller: Caller, input: DelegateInput): Promise<{
        session: {
            reused: boolean;
            id: string;
            title?: string;
            parentID?: string;
            agent?: string;
            model?: string;
            directory: string;
            state: "running" | "idle";
            outcome?: "succeeded" | "failed" | "interrupted";
            created: number;
            updated: number;
        } | {
            reused: boolean;
            id: string;
            title?: string;
            parentID?: string;
            agent?: string;
            model?: string;
            directory: string;
            state: "running" | "idle";
            outcome?: "succeeded" | "failed" | "interrupted";
            created: number;
            updated: number;
        };
        state: "running";
        timedOut: boolean;
        outcome?: undefined;
        reason?: undefined;
        result?: undefined;
    } | {
        session: {
            reused: boolean;
            id: string;
            title?: string;
            parentID?: string;
            agent?: string;
            model?: string;
            directory: string;
            state: "running" | "idle";
            outcome?: "succeeded" | "failed" | "interrupted";
            created: number;
            updated: number;
        } | {
            reused: boolean;
            id: string;
            title?: string;
            parentID?: string;
            agent?: string;
            model?: string;
            directory: string;
            state: "running" | "idle";
            outcome?: "succeeded" | "failed" | "interrupted";
            created: number;
            updated: number;
        };
        state: import("./wait.js").WaitState;
        outcome: "succeeded" | "failed" | "interrupted" | undefined;
        reason: string | undefined;
        result: string | undefined;
        timedOut: boolean;
    }>;
    private wait;
    private createOne;
    private self;
    private target;
    private budget;
    private remembered;
    private independents;
    private recordIndependent;
}
