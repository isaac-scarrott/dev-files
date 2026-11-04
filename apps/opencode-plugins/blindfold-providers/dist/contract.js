// The provider contract between blindfold (the consumer: card, rules, redaction, fill) and provider plugins
// (blindfold-providers: 1Password and Bitwarden). No imports, so it is valid in any bundle. blindfold keeps a byte-identical
// copy (plugin/src/providers-contract.ts; a test in each package compares them), the way native-ui's notify-contract.ts is
// shared: the registry lives on globalThis under a versioned Symbol.for key and is looked up on every call, so a provider
// plugin that reloads, loads after blindfold or is absent leaves nothing stale behind.
export const PROVIDERS_PROTOCOL = 1;
export const PROVIDERS_KEY = Symbol.for(`opencode-plugins.blindfold.providers.v${PROVIDERS_PROTOCOL}`);
export class LockedError extends Error {
    account;
    methods;
    constructor(account, methods) {
        super(`${account} is locked`);
        this.name = "LockedError";
        this.account = account;
        this.methods = methods;
    }
}
/** True for a LockedError from any copy of this contract: a provider bundle and blindfold each carry their own class. */
export const isLocked = (error) => error instanceof Error && error.name === "LockedError";
const holder = () => globalThis;
/** A provider plugin calls this in setup and the returned function in its dispose. */
export function registerProvider(provider) {
    const registry = (holder()[PROVIDERS_KEY] ??= { v: PROVIDERS_PROTOCOL, providers: new Map() });
    registry.providers.set(provider.kind, provider);
    return () => {
        if (registry.providers.get(provider.kind) === provider)
            registry.providers.delete(provider.kind);
    };
}
/** Blindfold calls this on every use: every account of every live provider, de-duplicated by id. */
export function accounts() {
    const registry = holder()[PROVIDERS_KEY];
    if (!registry)
        return [];
    const seen = new Set();
    return [...registry.providers.values()]
        .filter((provider) => provider.accepts.includes(PROVIDERS_PROTOCOL))
        .flatMap((provider) => provider.accounts())
        .filter((account) => !seen.has(account.id) && !!seen.add(account.id));
}
// ---- Origins ----
/** `scheme://host[:port]` of a URL, or undefined when it is not an http(s) URL. */
export function originOf(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
            return undefined;
        return `${parsed.protocol}//${parsed.host}`;
    }
    catch {
        return undefined;
    }
}
/**
 * The site a saved login names. Password managers store what was typed or imported, often a bare `www.example.com/login`
 * with no scheme, which they show and open as https. Read it the same way. The page's own address is never read this way.
 */
export function itemOriginOf(url) {
    const text = url.trim();
    if (text === "")
        return undefined;
    return originOf(text) ?? (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? undefined : originOf(`https://${text}`));
}
/** The page is the item's origin, or a subdomain of it: same scheme and port, never a lookalike, never the reverse. */
export function originMatches(itemOrigin, pageOrigin) {
    const item = originOf(itemOrigin);
    const page = originOf(pageOrigin);
    if (!item || !page)
        return false;
    const a = new URL(item);
    const b = new URL(page);
    if (a.protocol !== b.protocol || a.port !== b.port)
        return false;
    return b.hostname === a.hostname || b.hostname.endsWith("." + a.hostname);
}
/**
 * `pattern` is a host (`accounts.google.com`: that host only), `*.d` (`d` and every subdomain), or a full origin with a
 * scheme and optional port. Without a scheme only https matches, and without a port only the default port.
 */
export function patternMatches(pattern, pageOrigin) {
    const page = originOf(pageOrigin);
    if (!page)
        return false;
    const target = new URL(page);
    let rest = pattern.trim().toLowerCase();
    let scheme = "https:";
    const withScheme = rest.match(/^(https?:)\/\//);
    if (withScheme) {
        scheme = withScheme[1];
        rest = rest.slice(withScheme[0].length);
    }
    rest = rest.replace(/\/+$/, "");
    const [host = "", port = ""] = rest.split(":");
    if (target.protocol !== scheme || target.port !== port)
        return false;
    if (host.startsWith("*.")) {
        const base = host.slice(2);
        return base !== "" && (target.hostname === base || target.hostname.endsWith("." + base));
    }
    return host !== "" && target.hostname === host;
}
