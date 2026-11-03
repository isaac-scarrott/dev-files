import type { Field } from "./fields.js";
import { type Account, type FieldRef, type ItemRef, type UnlockMethod } from "./providers-contract.js";
import { type ConfigRule, type SavedRule } from "./rules.js";
/** One account (and item) that could serve a field. `key` identifies it inside a request. */
export type Candidate = {
    key: string;
    account: string;
    label: string;
    state: "ready" | "locked";
    methods: UnlockMethod[];
    item?: {
        id: string;
        title: string;
    };
    /** A saved "Always allow" rule covers it. */
    covered: boolean;
};
/** What the card needs to know about a field's provider: who could serve it, which one is chosen, or why none. */
export type Source = {
    state: "choose" | "unavailable";
    candidates: Candidate[];
    selected?: string;
    hint?: string;
};
/** A field the agent asked for, with the part of a vault item it names. */
export type Ask = {
    name: string;
    field: Field;
    item?: string;
    origin?: string;
};
export type Planned = {
    source: Source;
    refs: Map<string, {
        item: ItemRef;
        field: FieldRef;
    }>;
    itemField: string;
};
/** The part of an item a field name means: PASSWORD → password, EMAIL → username, an otp field → otp, else a label. */
export declare function itemFieldOf(ask: Pick<Ask, "name" | "item" | "field">): string;
export type BrokerDeps = {
    accounts: () => readonly Account[];
    rules: readonly ConfigRule[];
    saved: () => Promise<SavedRule[]>;
};
/**
 * Which accounts can serve each field, with nothing read: only references (titles and ids) are looked at. A field with no
 * provider at all is simply absent from the plan and is typed in the card, as before providers existed.
 */
export declare function createBroker(deps: BrokerDeps): {
    plan(asks: readonly Ask[]): Promise<Map<string, Planned>>;
    /** Every provider field has one chosen, ready, covered candidate: nothing for the user to decide. */
    silent(asks: readonly Ask[], plans: ReadonlyMap<string, Planned>): boolean;
    /** Reads the value of one planned field from the chosen candidate. Throws LockedError if the session ended. */
    read(planned: Planned, key: string, signal?: AbortSignal): Promise<{
        value: string;
        account: Account;
        candidate: Candidate;
    }>;
};
export type Broker = ReturnType<typeof createBroker>;
