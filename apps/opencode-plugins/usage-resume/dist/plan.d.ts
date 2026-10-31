import type { Availability } from "./usage.js";
export interface Waiting {
    readonly sessionID: string;
    /** When the failure was recorded, epoch ms. */
    readonly stalledAt: number;
    /** Never resume before this: stall + margin + backoff for earlier failed resumes. */
    readonly notBefore: number;
    /** Next time to look at this session, epoch ms. */
    dueAt: number;
    readonly kind?: string;
    /** What the error said, epoch ms. */
    readonly resetsAt?: number;
    /** Checks where the reset had passed but no fresh reading could confirm it. */
    unverified: number;
    /** The time last announced in the timeline. */
    announcedAt?: number;
    announcements: number;
}
export type Decision = {
    readonly action: "resume";
    readonly verified: boolean;
} | {
    readonly action: "wait";
    readonly at: number;
    readonly unverified?: boolean;
};
export declare const UNVERIFIED_LIMIT = 2;
/**
 * Pure. Decides whether a waiting session may resume now or when to look again. `nextPoll` is the earliest moment a
 * fresh usage reading can exist, so a check is never scheduled before it could learn anything.
 */
export declare function decide(w: Waiting, a: Availability, now: number, marginMs: number, nextPoll: number): Decision;
