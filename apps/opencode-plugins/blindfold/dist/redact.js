// Shorter encodings are too likely to match unrelated output, such as short hex runs.
const MIN_ENCODED_LENGTH = 8;
/**
 * `application/x-www-form-urlencoded`, which a browser POST body uses: a space is `+`, and `!'()~` are percent-encoded
 * although encodeURIComponent leaves them. Some encoders write the hex digits in lower case.
 */
function formEncode(value) {
    return encodeURIComponent(value)
        .replace(/%20/g, "+")
        .replace(/[!'()~]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());
}
// Common encodings an agent might produce without meaning to reveal the value.
function encodings(value) {
    const bytes = Buffer.from(value);
    const form = formEncode(value);
    return [
        JSON.stringify(value).slice(1, -1),
        encodeURIComponent(value),
        form,
        form.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()),
        bytes.toString("base64").replace(/=+$/, ""),
        bytes.toString("base64url"),
        bytes.toString("hex"),
    ];
}
function isPlainObject(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
export function replacement(name) {
    return `[REDACTED:${name}]`;
}
/** Values read from a provider and never stored by name; the oldest go first. */
const MAX_TRACKED = 200;
export class Redactor {
    #secrets = new Map();
    #tracked = new Map();
    #needles = [];
    get size() {
        return this.#secrets.size + this.#tracked.size;
    }
    names() {
        return [...this.#secrets.keys()];
    }
    entries() {
        return [...this.#secrets.entries()];
    }
    get(name) {
        return this.#secrets.get(name);
    }
    set(name, value) {
        if (value === "")
            throw new Error("Secrets must not be empty");
        this.#secrets.set(name, value);
        this.#rebuild();
    }
    /**
     * Redacts a value under a label without storing it as a named secret: it is not returned by `get`, not offered to shell
     * commands and not listed by `names`. For values read from a provider, which are read again on each use.
     */
    track(label, value) {
        if (value === "")
            return;
        this.#tracked.delete(`${label}\u0000${value}`);
        this.#tracked.set(`${label}\u0000${value}`, value);
        while (this.#tracked.size > MAX_TRACKED)
            this.#tracked.delete(this.#tracked.keys().next().value);
        this.#rebuild();
    }
    delete(name) {
        const deleted = this.#secrets.delete(name);
        if (deleted)
            this.#rebuild();
        return deleted;
    }
    text(input) {
        let output = input;
        for (const needle of this.#needles) {
            if (output.includes(needle.text))
                output = output.replaceAll(needle.text, needle.replacement);
        }
        return output;
    }
    /** Redacts strings nested in plain objects and arrays, preserving references when nothing changes. */
    value(input) {
        if (this.#needles.length === 0)
            return input;
        return this.#walk(input);
    }
    #walk(input) {
        if (typeof input === "string")
            return this.text(input);
        if (Array.isArray(input)) {
            let changed = false;
            const output = input.map((item) => {
                const next = this.#walk(item);
                if (next !== item)
                    changed = true;
                return next;
            });
            return changed ? output : input;
        }
        if (isPlainObject(input)) {
            let changed = false;
            const output = {};
            for (const [key, item] of Object.entries(input)) {
                const next = this.#walk(item);
                if (next !== item)
                    changed = true;
                output[key] = next;
            }
            return changed ? output : input;
        }
        return input;
    }
    #rebuild() {
        const needles = new Map();
        const all = [...this.#secrets, ...[...this.#tracked].map(([key, value]) => [key.slice(0, key.indexOf("\u0000")), value])];
        for (const [name, value] of all) {
            if (!needles.has(value))
                needles.set(value, replacement(name));
            for (const text of encodings(value)) {
                if (text.length >= MIN_ENCODED_LENGTH && !needles.has(text))
                    needles.set(text, replacement(name));
            }
        }
        this.#needles = [...needles]
            .map(([text, replacement]) => ({ text, replacement }))
            .sort((a, b) => b.text.length - a.text.length);
    }
}
