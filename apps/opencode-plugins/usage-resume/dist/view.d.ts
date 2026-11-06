/** What the server's `get` returns for a session. */
export interface SessionState {
    enabled: boolean;
    available: boolean;
    limited: boolean;
    resumesAt?: number;
}
/** The server's answer for one session, tagged with the session it is for. */
export interface Loaded {
    sessionID: string;
    state: SessionState;
}
export type PillTone = "success" | "warning" | "danger";
export interface PillSpec {
    readonly label: string;
    readonly icon: "refresh";
    readonly tone: PillTone;
    readonly title: string;
    /** What a click does; absent when it cannot do anything (the server cannot be read). */
    readonly toggleTo?: boolean;
}
export interface PillText {
    title: string;
    waiting(time: string): string;
    off: string;
    failed: string;
}
/**
 * The pill is visible only while the session is stopped at a usage limit; a failed read shows as a danger pill rather than
 * as nothing, because the user cannot tell "not limited" from "could not ask" otherwise. A subagent has no pill.
 */
export declare function pillFor(input: {
    sessionID: string;
    loaded: Loaded | undefined;
    failed: boolean;
    now: number;
    text: PillText;
}): PillSpec | undefined;
