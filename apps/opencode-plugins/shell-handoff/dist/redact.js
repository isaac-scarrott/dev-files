/**
 * Command text is written to a file and into the session, so secrets in it must not survive. Blindfold redacts values it
 * knows; here nothing is known, so this matches the shapes secrets take on a command line. It errs toward hiding: a
 * redacted word costs the reader a guess, a leaked token costs more.
 */
const MASK = "[REDACTED]";
const PEM = "-----";
/** Names whose value is a secret when assigned (`NAME=value`) or passed as a flag (`--name value`). */
const SECRET_NAME = "(?:[A-Za-z0-9_.-]*(?:token|secret|passw(?:or)?d|passwd|pwd|api[-_]?key|apikey|access[-_]?key|private[-_]?key|credential|auth(?!or)|bearer|cookie|session[-_]?id|signature)[A-Za-z0-9_.-]*)";
/** A value: quoted (to the matching quote) or bare up to whitespace. */
const VALUE = `(?:"(?:[^"\\\\]|\\\\.)*"|'[^']*'|[^\\s"';&|)]+)`;
const RULES = [
    // NAME=value, also exported / env-prefixed and `--name=value`.
    [new RegExp(`(\\b${SECRET_NAME}\\s*=\\s*)${VALUE}`, "gi"), `$1${MASK}`],
    // --password value, --token 'value', -p style is left alone (too ambiguous).
    [new RegExp(`(--${SECRET_NAME}\\s+)(?!-)${VALUE}`, "gi"), `$1${MASK}`],
    // Authorization / Cookie / X-Api-Key headers, in -H "…" or plain.
    [/((?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-access-token)\s*:\s*)(?:(?:bearer|basic|token)\s+)?[^"'\n\\]+/gi, `$1${MASK}`],
    // Bearer / Basic anywhere else.
    [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASK}`],
    // scheme://user:password@host
    [/\b([a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:)[^\s/@'"]+(@)/gi, `$1${MASK}$2`],
    // Tokens with a well-known prefix.
    [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|hf_[A-Za-z0-9]{30,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|pk_(?:live|test)_[A-Za-z0-9]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,})\b/g, MASK],
    // JSON web tokens.
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g, MASK],
    // PEM blocks.
    [new RegExp(`${PEM}BEGIN [A-Z ]*PRIVATE KEY${PEM}[\\s\\S]*?(?:${PEM}END [A-Z ]*PRIVATE KEY${PEM}|$)`, "g"), MASK],
];
/** A long run that mixes letters and digits and is not a path or a flag: a key someone pasted. */
const LONG_TOKEN = /(?<![A-Za-z0-9/_.-])[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9/_.-])/g;
function looksLikeSecret(run) {
    if (/^[a-f0-9]{40}$/i.test(run))
        return false; // a git object id is not a secret
    if (!/[A-Za-z]/.test(run) || !/[0-9]/.test(run))
        return false;
    if (/^[A-Za-z0-9]+(-[A-Za-z0-9]+){3,}$/.test(run) && run.length < 48)
        return false; // slug-ish names
    return true;
}
export function redact(text) {
    let out = text;
    for (const [pattern, replacement] of RULES)
        out = out.replace(pattern, replacement);
    return out.replace(LONG_TOKEN, (run) => (looksLikeSecret(run) ? MASK : run));
}
