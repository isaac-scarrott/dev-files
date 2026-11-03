import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Plugin } from "@opencode/plugin";
import { Error as ToolError } from "@opencode/plugin/promise/tool";
import { MAX_FIELDS, NAME_PATTERN, parseFields } from "./fields.js";
import { Redactor } from "./redact.js";
import { Blindfold } from "./rpc.js";
const NAMESPACE = "blindfold";
const GET_TOOL = "get";
const GET_TOOL_IDS = new Set([`${NAMESPACE}_${GET_TOOL}`, `${NAMESPACE}.${GET_TOOL}`]);
const PROMPT_TIMEOUT = 10 * 60_000;
const ACK_TIMEOUT = 5_000;
const ONEPASSWORD_PREFIX = "op://";
// Long enough for 1Password to ask the user to unlock it.
const ONEPASSWORD_TIMEOUT = 2 * 60_000;
const ONEPASSWORD_ACCOUNT = "my.1password.com";
function failure(names, status) {
    const what = names.join(", ");
    if (status === "cancelled")
        return `The user declined to provide ${what}.`;
    if (status === "timeout")
        return `Timed out waiting for the user to provide ${what}.`;
    return [
        `No OpenCode window or TUI with blindfold responded, so the user could not be asked for ${what}.`,
        "Ask the user to check that blindfold is in plugins in ~/.config/opencode/opencode.json (and cli.json for the TUI).",
    ].join(" ");
}
function group(options, key) {
    const value = options[key];
    if (value === undefined)
        return {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`opencode-blindfold ${key} option must be an object`);
    }
    return value;
}
function boolean(options, key, name, fallback) {
    const value = options[name];
    if (value === undefined)
        return fallback;
    if (typeof value !== "boolean")
        throw new Error(`opencode-blindfold ${key}.${name} option must be a boolean`);
    return value;
}
function getSecrets(options) {
    const secrets = new Map();
    for (const [name, value] of Object.entries(group(options, "secrets"))) {
        if (!new RegExp(NAME_PATTERN).test(name))
            throw new Error(`opencode-blindfold secrets names must match ${NAME_PATTERN}, got ${name}`);
        if (typeof value !== "string")
            throw new Error(`opencode-blindfold secrets.${name} option must be a string`);
        secrets.set(name, value);
    }
    return secrets;
}
function getOnePassword(options) {
    const account = group(options, "1password").account;
    if (account === undefined)
        return {};
    if (typeof account !== "string" || account === "")
        throw new Error("opencode-blindfold 1password.account option must be a non-empty string");
    return { account };
}
function getSettings(options) {
    const shell = group(options, "shell");
    const codemode = group(options, "codemode");
    const settings = {
        shell: { enabled: boolean(shell, "shell", "enabled", true), approve: boolean(shell, "shell", "approve", true) },
        codemode: { enabled: boolean(codemode, "codemode", "enabled", true) },
        secrets: getSecrets(options),
        onepassword: getOnePassword(options),
    };
    if (!settings.shell.enabled && !settings.codemode.enabled) {
        throw new Error("opencode-blindfold needs shell.enabled or codemode.enabled, otherwise secrets cannot be used");
    }
    return settings;
}
// Secret names are environment-variable style, so a word match covers $NAME, ${NAME}, os.environ["NAME"], and so on.
function mentioned(names, command) {
    return names.filter((name) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(command));
}
function opRead(reference, account) {
    const args = ["read", "--no-newline", ...(account ? ["--account", account] : []), reference];
    return new Promise((resolve) => {
        execFile("op", args, { timeout: ONEPASSWORD_TIMEOUT }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    });
}
async function readOnePassword(name, reference, account) {
    let { error, stdout, stderr } = await opRead(reference, account);
    // With one account signed in, op picks it on its own; with several, fall back to the personal account.
    if (error && account === undefined && stderr.includes("multiple accounts found")) {
        ;
        ({ error, stdout, stderr } = await opRead(reference, ONEPASSWORD_ACCOUNT));
    }
    const fail = (detail) => new Error(`Couldn't read ${name} from 1Password (${reference}): ${detail}`);
    if (error && error.code === "ENOENT")
        throw fail("the 1Password CLI (op) isn't installed.");
    if (error && error.killed)
        throw fail("timed out waiting for 1Password. Check that it's unlocked.");
    if (error)
        throw fail(stderr.trim() || error.message);
    if (stdout === "")
        throw fail("the field is empty.");
    return stdout;
}
function instructions(settings) {
    const call = settings.codemode.enabled ? "`tools.blindfold.get({ name, reason })` in Code Mode" : "the `blindfold_get` tool";
    const shape = settings.codemode.enabled ? "an object of the values keyed by name" : "a confirmation";
    return [
        `When a task needs a secret such as an API key, token, or password, call ${call}; it asks the user privately if the secret isn't stored yet.`,
        `When a step needs several inputs at once, such as a login, ask for them in one request, \`get({ fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason })\`, which returns ${shape}; a field is masked unless its kind is \`text\` or \`email\`, and a name like PASSWORD or TOKEN is always masked.`,
        settings.secrets.size > 0 ? `The user has configured these secrets: ${[...settings.secrets.keys()].join(", ")}.` : undefined,
        "Never ask the user to paste secrets into the chat.",
        "Secret values are redacted from tool output, so you won't see them even if you print them; you'll see `[REDACTED:NAME]` instead.",
    ].filter(Boolean).join(" ");
}
function shellUsage(settings) {
    if (!settings.shell.enabled)
        return [];
    return [
        "Shell commands receive it as an environment variable only when the command names it; pass it explicitly to programs that expect another variable, e.g. `GH_TOKEN=\"$GITHUB_TOKEN\" gh api user`.",
        settings.shell.approve ? "The user must approve each such command." : undefined,
    ];
}
function getDescription(settings) {
    return [
        "Get a secret such as an API token or password, or several inputs at once with `fields` (each `{ name, label?, kind?: text | email | secret }`, e.g. EMAIL and PASSWORD). If one isn't stored yet, the user is asked to enter it in a card in the chat.",
        settings.codemode.enabled
            ? "Returns the value (or, with `fields`, an object of values keyed by name) to the running code only; use it directly, e.g. in a fetch header."
            : "The value is never returned to you.",
        ...shellUsage(settings),
    ].filter(Boolean).join(" ");
}
const NAME_INPUT = {
    type: "string",
    pattern: NAME_PATTERN,
    description: "Environment-variable style name, e.g. GITHUB_TOKEN",
};
export default Plugin.define({
    id: "blindfold",
    async setup(ctx) {
        const settings = getSettings(ctx.options);
        const redactor = new Redactor();
        const pending = new Map();
        // Plain values are known upfront, so they're redacted and reach shell commands before any get.
        for (const [name, source] of settings.secrets) {
            if (source !== "" && !source.startsWith(ONEPASSWORD_PREFIX))
                redactor.set(name, source);
        }
        const rpc = await ctx.rpc.register(Blindfold, {
            submit: async (input) => {
                const { requestID, values } = input;
                const request = pending.get(requestID);
                // Exactly the asked names, each non-empty: the values are the whole answer.
                const complete = request && request.names.length === Object.keys(values).length && request.names.every((name) => typeof values[name] === "string" && values[name] !== "");
                if (!request || !complete)
                    return { accepted: false };
                request.finish({ status: "submitted", values });
                return { accepted: true };
            },
            ack: async (input) => {
                const request = pending.get(input.requestID);
                if (!request)
                    return { accepted: false };
                request.acknowledge();
                return { accepted: true };
            },
            list: async () => ({ requests: [...pending.values()].map((item) => item.request) }),
            cancel: async (input) => {
                const request = pending.get(input.requestID);
                if (!request)
                    return { accepted: false };
                request.finish({ status: "cancelled" });
                return { accepted: true };
            },
        });
        function ask(request, signal) {
            const requestID = randomUUID();
            return new Promise((resolve) => {
                let acknowledged = false;
                const finish = (answer) => {
                    if (!pending.delete(requestID))
                        return;
                    clearTimeout(timer);
                    clearTimeout(ackTimer);
                    signal?.removeEventListener("abort", abort);
                    resolve(answer);
                    void rpc.events.emit("resolved", { requestID, status: answer.status }).catch(() => undefined);
                };
                // The run was stopped: the card must not stay open for a call nobody is waiting on.
                const abort = () => finish({ status: "cancelled" });
                const timer = setTimeout(() => finish({ status: acknowledged ? "timeout" : "unavailable" }), PROMPT_TIMEOUT);
                const ackTimer = setTimeout(() => finish({ status: "unavailable" }), ACK_TIMEOUT);
                pending.set(requestID, {
                    request: { requestID, ...request },
                    names: request.fields.map((field) => field.name),
                    finish,
                    acknowledge: () => {
                        acknowledged = true;
                        clearTimeout(ackTimer);
                    },
                });
                rpc.events.emit("requested", { requestID, ...request }).catch(() => finish({ status: "unavailable" }));
                if (signal?.aborted)
                    abort();
                else
                    signal?.addEventListener("abort", abort, { once: true });
            });
        }
        // A session's prompts are asked one at a time (the TUI shows one dialog and a new prompt closes the open one), but a
        // card waiting in one session does not hold up another session's.
        const queues = new Map();
        function serial(sessionID, task) {
            const next = (queues.get(sessionID) ?? Promise.resolve()).then(task, task);
            const tail = next.catch(() => undefined);
            queues.set(sessionID, tail);
            void tail.then(() => queues.get(sessionID) === tail && queues.delete(sessionID));
            return next;
        }
        /** The stored values of the fields, asking the user once for those that are missing or to be replaced. */
        async function obtain(request) {
            const { wanted, replace } = request;
            const missing = (item) => redactor.get(item.field.name) === undefined || replace || item.replace;
            const read = () => Object.fromEntries(wanted.map(({ field }) => [field.name, redactor.get(field.name)]));
            if (!wanted.some(missing))
                return read();
            return serial(request.sessionID, async () => {
                // Another call may have stored them while this one waited.
                const asking = wanted.filter(missing);
                if (asking.length === 0)
                    return read();
                const prompted = [];
                const resolved = {};
                for (const { field } of asking) {
                    if (settings.secrets.has(field.name))
                        resolved[field.name] = await configured(field.name);
                    else
                        prompted.push(field);
                }
                if (prompted.length > 0) {
                    const answer = await ask({ sessionID: request.sessionID, callID: request.callID, messageID: request.messageID, reason: request.reason, fields: prompted }, request.signal);
                    if (answer.status !== "submitted")
                        throw new Error(failure(prompted.map((field) => field.name), answer.status));
                    Object.assign(resolved, answer.values);
                }
                for (const [name, value] of Object.entries(resolved))
                    redactor.set(name, value);
                return read();
            });
        }
        async function configured(name) {
            const source = settings.secrets.get(name);
            if (source === "")
                throw new Error(`${name} is empty in the opencode-blindfold secrets option, for example because its {env:...} variable isn't set.`);
            if (source.startsWith(ONEPASSWORD_PREFIX))
                return readOnePassword(name, source, settings.onepassword.account);
            return source;
        }
        await ctx.tool.transform((editor) => {
            editor.namespace({
                name: NAMESPACE,
                description: "Secrets provided by the user without revealing their values to the agent.",
            });
            editor.add({
                name: GET_TOOL,
                description: getDescription(settings),
                input: {
                    type: "object",
                    properties: {
                        name: NAME_INPUT,
                        fields: {
                            type: "array",
                            minItems: 1,
                            maxItems: MAX_FIELDS,
                            description: "Several inputs asked in one card, instead of `name`; returns an object keyed by name",
                            items: {
                                type: "object",
                                properties: {
                                    name: NAME_INPUT,
                                    label: { type: "string", description: "What the user sees above the input; defaults to the name" },
                                    kind: { enum: ["text", "email", "secret"], description: "text and email are shown as typed, secret is masked. Defaults from the name (PASSWORD, TOKEN, KEY, SECRET => secret; EMAIL, USER, LOGIN => shown)" },
                                    replace: { type: "boolean", description: "Ask again for this field even if it is stored" },
                                },
                                required: ["name"],
                                additionalProperties: false,
                            },
                        },
                        reason: { type: "string", minLength: 1, description: "Why it is needed, shown to the user if it must be entered" },
                        replace: { type: "boolean", description: "Ask the user again even if it is already stored" },
                    },
                    additionalProperties: false,
                },
                // Code Mode hands `output` to the running code: a string for one name, an object keyed by name for `fields`. Declared
                // only there, because a tool that declares an output must return it, and a regular tool returns no value.
                ...(settings.codemode.enabled ? { output: { oneOf: [{ type: "string" }, { type: "object", additionalProperties: { type: "string" } }] } } : {}),
                // In Code Mode the value reaches only the running code. As a regular tool the result enters the chat,
                // so it confirms the secret is stored without returning it.
                options: settings.codemode.enabled
                    ? { namespace: NAMESPACE, codemode: true, pinned: true }
                    : { namespace: NAMESPACE, codemode: false },
                async execute(input, context) {
                    const { reason, replace } = input;
                    const wanted = parseFields(input);
                    const names = wanted.map(({ field }) => field.name);
                    const single = input.name !== undefined;
                    await context.progress({ title: `Secret ${names.join(", ")}` });
                    const values = await obtain({
                        sessionID: context.sessionID,
                        callID: context.id,
                        messageID: context.messageID,
                        reason: reason ?? `The agent needs ${names.join(", ")}.`,
                        wanted,
                        replace,
                        signal: context.signal,
                    });
                    if (settings.codemode.enabled)
                        return single ? { content: values[names[0]], output: values[names[0]] } : { content: JSON.stringify(values), output: values };
                    return {
                        content: `Secret ${names.join(", ")} ${names.length === 1 ? "is" : "are"} stored. Blindfold secrets available: ${redactor.names().join(", ")}.`,
                        metadata: { title: `Secret ${names.join(", ")}`, names },
                    };
                },
            });
        });
        await ctx.tool.hook("execute.after", (event) => {
            if (redactor.size === 0 || GET_TOOL_IDS.has(event.tool))
                return;
            if (event.status === "completed") {
                event.result = redactor.value(event.result);
                return;
            }
            const message = redactor.text(event.error.message);
            const metadata = redactor.value(event.error.metadata);
            if (message === event.error.message && metadata === event.error.metadata)
                return;
            const cause = redactor.text(String(event.error.error)) === String(event.error.error) ? event.error.error : undefined;
            event.error = new ToolError({ message, metadata, error: cause });
        });
        const system = instructions(settings);
        await ctx.session.hook("context", (event) => {
            if (redactor.size > 0) {
                event.messages = redactor.value(event.messages);
                event.system = redactor.value(event.system);
            }
            event.system.push({ type: "text", text: system });
        });
        // Last line of defense for requests that bypass the context hook, such as compaction and titles.
        await ctx.session.hook("http.request", async (event) => {
            if (redactor.size === 0 || !event.request.body)
                return;
            const body = await event.request.clone().text();
            const redacted = redactor.text(body);
            if (redacted === body)
                return;
            const headers = new Headers(event.request.headers);
            headers.delete("content-length");
            event.request = new Request(event.request, { body: redacted, headers });
        });
        if (settings.shell.enabled) {
            // Commands can only read secrets they name, so naming one is what triggers approval.
            if (settings.shell.approve) {
                await ctx.permission.hook("evaluate", (event) => {
                    if (event.action !== "shell" || event.effect === "deny")
                        return;
                    const names = [...new Set(event.resources.flatMap((command) => mentioned(redactor.names(), command)))];
                    if (names.length === 0)
                        return;
                    event.effect = "ask";
                    event.message = `This command can read ${names.join(", ")}`;
                });
            }
            await ctx.shell.hook("create.before", (event) => {
                for (const name of mentioned(redactor.names(), event.command))
                    event.env[name] = redactor.get(name);
            });
        }
        return () => {
            for (const request of pending.values())
                request.finish({ status: "unavailable" });
        };
    },
});
