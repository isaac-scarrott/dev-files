export interface Options {
    readonly maxChildren: number;
    readonly maxDepth: number;
    readonly maxConcurrent: number;
    readonly models?: readonly string[];
    readonly defaultWaitMs: number;
    readonly maxWaitMs: number;
    readonly maxWaitSessions: number;
    readonly maxReadChars: number;
    readonly messageLimit: number;
    readonly scope: "tree" | "project";
    readonly assertSubagentPermission: boolean;
}
export declare const DEFAULTS: Options;
export declare function parseOptions(raw?: Readonly<Record<string, unknown>>): Options;
