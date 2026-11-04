import { Base } from "./account.js";
import { LockedError, originMatches, originOf } from "./contract.js";
import { apiKeys as keyStore, memoryTokens } from "./keychain.js";
import { PROBE_MS, classify } from "./probe.js";
import { reason, run } from "./run.js";
const PASSWORD_VARIABLE = "BLINDFOLD_BW_PASSWORD";
/**
 * Bitwarden (cloud, no SSO) through the `bw` CLI: `bw login --apikey` once, then the master password to unlock. The master
 * password goes to the child through its environment (`--passwordenv`), the session (BW_SESSION) lives here and nowhere
 * else, and `bw lock` runs when the idle timer fires: the CLI itself never expires a session.
 */
export class Bitwarden extends Base {
    kind = "bitwarden";
    capabilities = { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: ["apiKey", "masterPassword"] };
    bin;
    appData;
    organizationId;
    sync;
    keys;
    constructor(options) {
        super(options);
        this.bin = options.bin ?? "bw";
        this.appData = options.appDataDir;
        this.organizationId = options.organizationId;
        this.sync = options.syncOnUnlock ?? true;
        this.keys = options.apiKeys ?? keyStore(memoryTokens(), memoryTokens());
    }
    async hasCredential() {
        return !!(await this.keys.get(this.id));
    }
    base(extra = {}) {
        return { BITWARDENCLI_APPDATA_DIR: this.appData, BW_NOINTERACTION: "true", ...extra };
    }
    async status() {
        const local = await super.status();
        if (local.state === "unlocked")
            return local;
        const result = await run(this.bin, ["status"], this.base());
        if (result.code !== 0)
            return { state: "unavailable", reason: reason(result) };
        let status;
        try {
            status = JSON.parse(result.stdout).status;
        }
        catch {
            return { state: "unavailable", reason: "unexpected output from bw status" };
        }
        // Logged out needs the API key (unless one is saved); logged in needs only the master password.
        return { state: "locked", methods: status === "unauthenticated" && !(await this.hasCredential()) ? ["apiKey"] : ["masterPassword"] };
    }
    async unlock(input, signal) {
        if (input.method !== "apiKey" && input.method !== "masterPassword")
            throw new Error(`${this.label}: ${input.method} unlock is not supported`);
        const saved = input.method === "masterPassword" ? await this.keys.get(this.id) : undefined;
        const given = input.method === "apiKey" && input.clientId && input.clientSecret ? { clientId: input.clientId, clientSecret: input.clientSecret } : undefined;
        const secrets = [input.password, ...(input.method === "apiKey" ? [input.clientSecret ?? ""] : []), ...(saved ? [saved.clientSecret] : [])];
        const key = given ?? (saved && (await this.loggedOut(signal)) ? saved : undefined);
        if (key) {
            const login = await run(this.bin, ["login", "--apikey"], this.base({ BW_CLIENTID: key.clientId, BW_CLIENTSECRET: key.clientSecret }), undefined, signal);
            if (login.code !== 0 && !/already logged in/i.test(login.stderr + login.stdout))
                throw new Error(`${this.label}: ${reason(login, secrets)}`);
        }
        const unlocked = await run(this.bin, ["unlock", "--raw", "--passwordenv", PASSWORD_VARIABLE], this.base({ [PASSWORD_VARIABLE]: input.password }), undefined, signal);
        if (unlocked.code !== 0 || !unlocked.stdout.trim())
            throw new Error(`${this.label}: ${reason(unlocked, secrets)}`);
        const env = this.base({ BW_SESSION: unlocked.stdout.trim() });
        if (this.sync)
            await run(this.bin, ["sync"], env, undefined, signal);
        this.open({ env, method: input.method });
        return this.status();
    }
    async forget() {
        await this.lock();
        await this.keys.delete(this.id);
    }
    async loggedOut(signal) {
        const result = await run(this.bin, ["status"], this.base(), undefined, signal);
        try {
            return result.code === 0 && JSON.parse(result.stdout).status === "unauthenticated";
        }
        catch {
            return false;
        }
    }
    /** Connection test: signed in and unlocked, then how many collections the account can list. Counts only. */
    async probe(signal, timeoutMs = PROBE_MS) {
        if (!this.session) {
            const result = await run(this.bin, ["status"], this.base(), undefined, signal, timeoutMs);
            if (result.code !== 0 || result.missing || result.timedOut)
                return classify(result);
            try {
                const status = JSON.parse(result.stdout).status;
                return status === "unauthenticated" ? { ok: false, code: (await this.hasCredential()) ? "locked" : "not_logged_in" } : { ok: false, code: "locked" };
            }
            catch {
                return { ok: false, code: "other", detail: "unexpected output from bw status" };
            }
        }
        const args = ["list", "collections", "--nointeraction", ...(this.organizationId ? ["--organizationid", this.organizationId] : [])];
        const result = await run(this.bin, args, this.session.env, undefined, signal, timeoutMs);
        if (result.code !== 0 || result.missing || result.timedOut) {
            const failed = classify(result);
            if (failed.code === "locked")
                await super.lock();
            return failed;
        }
        try {
            return { ok: true, code: "ok", count: JSON.parse(result.stdout || "[]").length };
        }
        catch {
            return { ok: false, code: "other", detail: "unexpected output from bw list collections" };
        }
    }
    async lock() {
        if (this.session)
            await run(this.bin, ["lock"], this.session.env);
        await super.lock();
    }
    async call(args, signal) {
        const result = await run(this.bin, args, this.env(), undefined, signal);
        if (result.code !== 0) {
            if (/locked|not logged in/i.test(result.stderr)) {
                await super.lock();
                throw new LockedError(this.id, ["masterPassword"]);
            }
            throw new Error(`${this.label}: ${reason(result)}`);
        }
        return result.stdout;
    }
    unlockMethods() {
        return ["masterPassword"];
    }
    async findByOrigin(pageOrigin, signal) {
        const hit = this.cached(pageOrigin);
        if (hit)
            return hit;
        // `bw list` returns decrypted items, values included: parse here, keep the reference, drop the rest.
        const raw = JSON.parse(await this.call(["list", "items", "--url", pageOrigin, "--nointeraction"], signal));
        const items = raw
            .filter((item) => !this.organizationId || item.organizationId === this.organizationId)
            .map((item) => ({
            account: this.id,
            id: item.id,
            title: item.name,
            origins: (item.login?.uris ?? []).map((uri) => originOf(uri.uri)).filter((origin) => !!origin),
            hasOtp: !!item.login?.totp,
            fields: ["username", "password", ...(item.login?.totp ? ["otp"] : [])],
        }))
            .filter((item) => item.origins.some((origin) => originMatches(origin, pageOrigin)));
        this.cache.set(pageOrigin, { at: Date.now(), items });
        return items;
    }
    async resolve(reference) {
        const match = reference.match(/^bw:([^/]+)\/(username|password|otp)$/);
        if (!match)
            throw new Error(`${this.label}: not a bw:<id>/<field> reference`);
        return { item: { account: this.id, id: match[1], title: match[1], origins: [], hasOtp: match[2] === "otp", fields: [match[2]] }, field: match[2] };
    }
    async read(item, field, signal) {
        const what = field === "otp" ? "totp" : typeof field === "string" ? field : undefined;
        if (!what)
            throw new Error(`${this.label}: custom fields are not supported`);
        return this.call(["get", what, item.id, "--nointeraction"], signal);
    }
}
