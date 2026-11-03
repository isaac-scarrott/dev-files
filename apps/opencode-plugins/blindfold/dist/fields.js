export const NAME_PATTERN = "^[A-Z_][A-Z0-9_]*$";
export const MAX_FIELDS = 8;
const KINDS = ["text", "email", "secret"];
// Whole `_`-separated words, so KEY matches API_KEY but not KEYBOARD.
const SECRET_WORDS = new Set(["PASS", "PASSWORD", "PASSWD", "PWD", "PASSPHRASE", "TOKEN", "KEY", "SECRET", "CREDENTIAL", "CREDENTIALS"]);
// Long enough to be unambiguous inside a run-together name such as GITHUBTOKEN.
const SECRET_PARTS = ["PASSWORD", "PASSWD", "PASSPHRASE", "TOKEN", "SECRET"];
const EMAIL_WORDS = new Set(["EMAIL", "MAIL"]);
const TEXT_WORDS = new Set(["USER", "USERNAME", "LOGIN"]);
const words = (name) => name.split("_").filter(Boolean);
export function looksSecret(name) {
    return words(name).some((word) => SECRET_WORDS.has(word)) || SECRET_PARTS.some((part) => name.includes(part));
}
/** The kind a name implies. A name that matches nothing is a secret, so an unknown name is masked. */
export function defaultKind(name) {
    if (looksSecret(name))
        return "secret";
    const parts = words(name);
    if (parts.some((word) => EMAIL_WORDS.has(word)))
        return "email";
    if (parts.some((word) => TEXT_WORDS.has(word)))
        return "text";
    return "secret";
}
function humanize(name) {
    const text = words(name).join(" ").toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}
/**
 * A password-like name stays masked when the agent labels it `email`, whatever the label says; only an explicit `text`
 * unmasks it, because that is the one kind that says the value is meant to be read.
 */
export function resolveField(input) {
    const kind = input.kind ?? defaultKind(input.name);
    const masked = kind === "secret" || (looksSecret(input.name) && kind !== "text");
    const label = input.label?.trim() || humanize(input.name);
    return { name: input.name, label, kind: masked ? "secret" : kind, masked };
}
/** Checks and normalises the agent's field list. Throws a message safe to show the agent. */
export function parseFields(input) {
    const pattern = new RegExp(NAME_PATTERN);
    const hasName = input.name !== undefined;
    const hasFields = input.fields !== undefined;
    if (hasName === hasFields)
        throw new Error("Pass either `name` or `fields`, not both and not neither.");
    const raw = hasName ? [{ name: input.name }] : input.fields;
    if (!Array.isArray(raw) || raw.length === 0)
        throw new Error("`fields` must be a non-empty list.");
    if (raw.length > MAX_FIELDS)
        throw new Error(`At most ${MAX_FIELDS} fields per request.`);
    const seen = new Set();
    return raw.map((item) => {
        const entry = item;
        const name = entry?.name;
        if (typeof name !== "string" || !pattern.test(name))
            throw new Error(`Secret name must match ${NAME_PATTERN}`);
        if (seen.has(name))
            throw new Error(`Field ${name} is listed twice.`);
        seen.add(name);
        if (entry?.kind !== undefined && (typeof entry.kind !== "string" || !KINDS.includes(entry.kind)))
            throw new Error(`Field ${name}: kind must be text, email or secret.`);
        if (entry?.label !== undefined && typeof entry.label !== "string")
            throw new Error(`Field ${name}: label must be a string.`);
        const field = resolveField({ name, label: entry?.label, kind: entry?.kind });
        return { field, replace: entry?.replace === true ? true : undefined };
    });
}
/**
 * Light shape check by kind. `invalid` blocks Submit and is reserved for what cannot be an address (no `@`, spaces
 * inside, nothing before or after the `@`); `warn` only says so. The result never carries the value.
 */
export function check(kind, value) {
    if (value === "")
        return { level: "ok" };
    if (kind === "email") {
        const trimmed = value.trim();
        const at = trimmed.indexOf("@");
        if (/\s/.test(trimmed) || at < 1 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1)
            return { level: "invalid", message: "email" };
        if (!trimmed.slice(at + 1).includes("."))
            return { level: "warn", message: "email-domain" };
        return { level: "ok" };
    }
    if (kind === "secret" && value !== value.trim())
        return { level: "warn", message: "space" };
    return { level: "ok" };
}
/** Email and plain text are trimmed on submit; a secret is sent exactly as typed. */
export const normalize = (kind, value) => (kind === "secret" ? value : value.trim());
