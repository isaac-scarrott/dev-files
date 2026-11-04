/** One use of a provider secret. Names only: no value, no token, no session. */
export type AuditEntry = {
    time: string;
    session: string;
    /** What asked: `get` (value to the running code) or `fill` (value to a page, never to code). */
    via: "get" | "fill";
    account: string;
    accountLabel: string;
    item?: string;
    field: string;
    name: string;
    origin?: string;
    /** `flow`: served under an approved sign-in (see `grant`) without a card of its own. */
    outcome: "allowed" | "always" | "rule" | "flow" | "denied" | "error";
    /** The id of the sign-in approval that created or served this use. */
    grant?: string;
};
export declare const defaultAuditFile: () => string;
/** The last entries stay in memory for the settings page; each is also appended to a JSONL file (mode 0600) unless `file` is false. */
export declare function audit(file: string | false): {
    add(entry: AuditEntry): void;
    recent: () => AuditEntry[];
};
