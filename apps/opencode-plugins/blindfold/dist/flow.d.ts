import type { Candidate, Source } from "./broker.js";
/** The parts of a login item a sign-in can cover. Anything else (a labelled field) always asks on its own. */
export declare const FLOW_PARTS: readonly ["username", "password", "otp"];
export declare const DEFAULT_FLOW_MINUTES = 3;
export declare const MAX_FLOW_MINUTES = 10;
/** What a card offers when the user may approve the whole sign-in: the parts one Allow covers, and the ones Always allow saves. */
export type FlowOffer = {
    parts: string[];
    always: string[];
    minutes: number;
};
/** A field of a vault item, named by the part it means, in one session, tab and origin. */
export type GrantUse = {
    session: string;
    tabID: string;
    origin: string;
    account: string;
    item: string;
    part: string;
};
/**
 * An in-memory approval of a sign-in. Never written anywhere. It lets later `fill` requests of the same session, tab and
 * origin for the same item and a listed part go through without a card, each part once.
 */
export type Grant = {
    id: string;
    session: string;
    tabID: string;
    origin: string;
    account: string;
    item: string;
    parts: ReadonlySet<string>;
    used: Set<string>;
    expiresAt: number;
    /** The card that created it; its answered row counts the uses. */
    requestID?: string;
};
export type NewGrant = Omit<Grant, "id" | "expiresAt" | "used" | "parts"> & {
    parts: Iterable<string>;
    used?: Iterable<string>;
};
export declare function createGrants(options?: {
    now?: () => number;
    minutes?: number;
}): {
    ttl: number;
    create(input: NewGrant): Grant;
    /** The grant that would cover this use, without spending it. */
    peek: (use: GrantUse) => Grant | undefined;
    /** Spends the part: synchronous, so two requests cannot both get it. */
    take(use: GrantUse): Grant | undefined;
    /** Gives a spent part back, for a request that was spent on but then failed before the value was used. */
    release(grantID: string, part: string): void;
    /** The tab was closed or went somewhere unknown. No tab named: every tab's. */
    revokeTab(tabID?: string): void;
    /** The tab navigated: grants for any other origin end. An unknown origin ends them all. No tab named: every tab's. */
    revokeOffOrigin(tabID: string | undefined, origin: string | undefined): void;
    clear: () => void;
    readonly size: number;
    list: () => Grant[];
};
export type Grants = ReturnType<typeof createGrants>;
/**
 * The sign-in the user may approve in one go: every provider field of the request chooses the same candidate, and that
 * candidate offers one. Used by the card (what to show) and by the server (what to believe on submit); the server never
 * trusts the card's word for it.
 */
export declare function flowOf(fields: readonly {
    name: string;
    source?: Source;
}[], keyOf: (field: {
    name: string;
    source?: Source;
}) => string | undefined): {
    candidate: Candidate;
    flow: FlowOffer;
} | undefined;
/** Reads the `flowMinutes` option: a number from a little over 0 to 10. */
export declare function parseFlowMinutes(value: unknown): number;
