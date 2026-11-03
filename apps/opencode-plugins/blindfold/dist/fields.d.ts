/** What a field holds. `secret` is masked; `text` and `email` are shown as typed. */
export type Kind = "text" | "email" | "secret";
/** A field as the agent names it. */
export type FieldInput = {
    name: string;
    label?: string;
    kind?: Kind;
    replace?: boolean;
};
/** A field as the user is asked for it: the label is always set, and `masked` says how the input draws. */
export type Field = {
    name: string;
    label: string;
    kind: Kind;
    masked: boolean;
};
export declare const NAME_PATTERN = "^[A-Z_][A-Z0-9_]*$";
export declare const MAX_FIELDS = 8;
export declare function looksSecret(name: string): boolean;
/** The kind a name implies. A name that matches nothing is a secret, so an unknown name is masked. */
export declare function defaultKind(name: string): Kind;
/**
 * A password-like name stays masked when the agent labels it `email`, whatever the label says; only an explicit `text`
 * unmasks it, because that is the one kind that says the value is meant to be read.
 */
export declare function resolveField(input: FieldInput): Field;
/** Checks and normalises the agent's field list. Throws a message safe to show the agent. */
export declare function parseFields(input: {
    name?: unknown;
    fields?: unknown;
}): {
    field: Field;
    replace?: boolean;
}[];
export type Check = {
    level: "ok" | "warn" | "invalid";
    message?: "email" | "email-domain" | "space";
};
/**
 * Light shape check by kind. `invalid` blocks Submit and is reserved for what cannot be an address (no `@`, spaces
 * inside, nothing before or after the `@`); `warn` only says so. The result never carries the value.
 */
export declare function check(kind: Kind, value: string): Check;
/** Email and plain text are trimmed on submit; a secret is sent exactly as typed. */
export declare const normalize: (kind: Kind, value: string) => string;
