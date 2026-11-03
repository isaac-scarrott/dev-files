import { Base } from "./account.js";
import { LockedError, originMatches, originOf } from "./contract.js";
import { memoryTokens } from "./keychain.js";
import { reason, run } from "./run.js";
/**
 * 1Password through the `op` CLI, with the desktop-app integration off on every call (OP_BIOMETRIC_UNLOCK_ENABLED=false):
 * `op` never asks the 1Password app, so no "Allow opencode-cli" dialog and no biometrics.
 */
export class OnePassword extends Base {
    kind = "1password";
    capabilities;
    bin;
    method;
    address;
    shorthand;
    tokenEnv;
    vaults;
    tokens;
    constructor(options) {
        super(options);
        this.method = options.method ?? "serviceAccount";
        this.capabilities = { otp: true, searchByOrigin: true, write: false, passkey: false, unlock: [this.method] };
        this.bin = options.bin ?? "op";
        this.address = options.address ?? "my.1password.com";
        this.shorthand = options.shorthand ?? options.id;
        this.tokenEnv = options.tokenEnv;
        this.vaults = options.vaults ?? [];
        this.tokens = options.tokens ?? memoryTokens();
    }
    base() {
        return { OP_BIOMETRIC_UNLOCK_ENABLED: "false" };
    }
    serviceSession(token) {
        return { env: { ...this.base(), OP_SERVICE_ACCOUNT_TOKEN: token }, method: "serviceAccount" };
    }
    /** A service account with a saved token is unlocked without a prompt: the token is the session. */
    async status() {
        if (!this.session && this.method === "serviceAccount") {
            const token = (await this.tokens.get(this.id)) ?? (this.tokenEnv ? process.env[this.tokenEnv] : undefined);
            if (token)
                this.open(this.serviceSession(token));
        }
        return super.status();
    }
    async unlock(input, signal) {
        if (input.method === "serviceAccount" && this.method === "serviceAccount") {
            const session = this.serviceSession(input.token);
            // One listing proves the token and fills the cache.
            const listed = await this.list(session.env, signal, [input.token]).catch((error) => {
                if (error instanceof LockedError)
                    throw new Error(`${this.label}: the service account token was rejected`);
                throw error;
            });
            this.cache.set("list", { at: Date.now(), items: listed });
            this.open(session);
            // A token that cannot be saved stays in memory for the session.
            await this.tokens.set(this.id, input.token);
        }
        else if (input.method === "masterPassword" && this.method === "masterPassword") {
            const result = await run(this.bin, ["signin", "--raw", "--account", this.address], this.base(), input.password, signal);
            if (result.code !== 0 || !result.stdout.trim())
                throw new Error(`${this.label}: ${reason(result, [input.password])}`);
            const token = result.stdout.trim();
            const env = { ...this.base(), [`OP_SESSION_${this.shorthand}`]: token };
            this.cache.set("list", { at: Date.now(), items: await this.list(env, signal, [token]) });
            this.open({ env, method: "masterPassword" });
        }
        else
            throw new Error(`${this.label}: ${input.method} unlock is not supported`);
        return this.status();
    }
    async lock() {
        if (this.session?.method === "masterPassword")
            await run(this.bin, ["signout", "--account", this.address], this.session.env);
        await super.lock();
    }
    /** Forgets the saved token as well: the next use asks for a new one. */
    async forget() {
        await this.lock();
        await this.tokens.delete(this.id);
    }
    async call(args, env, signal, secrets = []) {
        const result = await run(this.bin, args, env, undefined, signal);
        if (result.code !== 0) {
            if (/not currently signed in|session expired|invalid service account token|authenticat/i.test(result.stderr)) {
                await super.lock();
                throw new LockedError(this.id, this.unlockMethods());
            }
            throw new Error(`${this.label}: ${reason(result, secrets)}`);
        }
        return result.stdout;
    }
    async list(env, signal, secrets = []) {
        const scopes = this.vaults.length > 0 ? this.vaults.map((vault) => ["--vault", vault]) : [[]];
        const items = [];
        for (const scope of scopes) {
            const out = await this.call(["item", "list", "--categories", "Login", "--format", "json", ...scope], env, signal, secrets);
            for (const item of JSON.parse(out || "[]")) {
                const vault = item.vault?.id ?? item.vault?.name ?? "";
                items.push({
                    account: this.id,
                    id: `${vault}/${item.id}`,
                    title: item.title,
                    origins: (item.urls ?? []).map((url) => originOf(url.href)).filter((origin) => !!origin),
                    hasOtp: true,
                    fields: ["username", "password", "otp"],
                });
            }
        }
        return items;
    }
    async findByOrigin(pageOrigin, signal) {
        const env = this.env();
        const items = this.cached("list") ?? (await this.list(env, signal));
        this.cache.set("list", { at: Date.now(), items });
        return items.filter((item) => item.origins.some((origin) => originMatches(origin, pageOrigin)));
    }
    async resolve(reference) {
        const match = reference.match(/^op:\/\/([^/]+)\/([^/]+)\/([^?]+)(\?attribute=otp)?$/);
        if (!match)
            throw new Error(`${this.label}: not an op:// reference`);
        const field = match[4] ? "otp" : match[3] === "password" || match[3] === "username" ? match[3] : { label: match[3] };
        return { item: { account: this.id, id: reference, title: `${match[1]}/${match[2]}`, origins: [], hasOtp: !!match[4], fields: [match[3]] }, field };
    }
    async read(item, field, signal) {
        const env = this.env();
        if (item.id.startsWith("op://"))
            return this.call(["read", "--no-newline", item.id], env, signal);
        const [vault, id] = item.id.split("/");
        if (field === "otp")
            return (await this.call(["item", "get", id, "--vault", vault, "--otp"], env, signal)).trim();
        const label = typeof field === "string" ? field : field.label;
        return this.call(["read", "--no-newline", `op://${vault}/${id}/${label}`], env, signal);
    }
}
