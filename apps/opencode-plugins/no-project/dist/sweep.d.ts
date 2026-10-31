export declare const DAY: number;
/** A scratch folder whose sessions are all archived goes once the newest archive is older than this. */
export declare const ARCHIVED_AFTER: number;
/** A scratch folder no session was ever created in goes once it is older than this (an abandoned draft). */
export declare const ABANDONED_AFTER: number;
type Page = {
    data: ReadonlyArray<Listed>;
    cursor: {
        next?: string | null;
    };
};
type Listed = {
    id: string;
    time: {
        archived?: number | undefined;
    };
    location: {
        directory: string;
    };
};
export type SessionLister = {
    session: {
        list(input: {
            archived?: boolean;
            limit?: number;
            cursor?: string;
            directory?: string;
        }): Promise<Page>;
    };
};
/** The server's data dir for opencode, resolved like the host does (`XDG_DATA_HOME`, else `~/.local/share`). */
export declare function scratchBase(env?: NodeJS.ProcessEnv, home?: () => string): string | undefined;
/** `<base>/<uuid>/No project[/...]` -> uuid. Anything else, including `..` escapes, is not ours. */
export declare function scratchId(base: string, directory: string): string | undefined;
export type Verdict = "keep" | "delete";
/** The rule for one folder, given its sessions (as listed) and the folder's age. */
export declare function decide(sessions: ReadonlyArray<Pick<Listed, "time">>, ageMs: number, now: number): Verdict;
export type SweepOptions = {
    base: string;
    client: SessionLister;
    now?: number;
    log?: (line: string) => void;
};
/** Sweeps the base dir. Returns the ids deleted. A listing failure rejects and deletes nothing. */
export declare function sweep(options: SweepOptions): Promise<string[]>;
/** The folder of a session that was just deleted: removed at once when no other session still uses it. */
export declare function removeIfUnused(options: {
    base: string;
    client: SessionLister;
    directory: string;
    log?: (line: string) => void;
}): Promise<boolean>;
export {};
