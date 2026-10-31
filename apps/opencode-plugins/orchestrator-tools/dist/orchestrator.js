import { Error as ToolError } from "@opencode/plugin/promise/tool";
import { METADATA_KEY, ancestors, describe, marker, reachable, running } from "./scope.js";
import { clip, finalText, summarize } from "./messages.js";
import { waitForSessions } from "./wait.js";
const MAX_MESSAGES = 50;
const FINAL_TEXT_CHARS = 8_000;
const MIN_WAIT_MS = 1_000;
const TITLE_CHARS = 80;
const LIST_LIMIT = 100;
export const fail = (message, metadata) => new ToolError({ message, metadata });
function requestKey(callerID, clientRequestId) {
    return `request/${callerID}/${clientRequestId}`;
}
function createdKey(callerID) {
    return `created/${callerID}`;
}
function parseModel(model, allowed) {
    if (model === undefined)
        return undefined;
    if (allowed && !allowed.includes(model)) {
        throw fail(`Model ${model} is not allowed here. Allowed models: ${allowed.join(", ")}`);
    }
    const slash = model.indexOf("/");
    if (slash <= 0 || slash === model.length - 1)
        throw fail(`Model must be written as provider/model, got ${model}`);
    return { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
}
function compose(prompt, context) {
    const text = prompt.trim();
    if (!text)
        throw fail("prompt must not be empty");
    const extra = context?.trim();
    return extra ? `${text}\n\n${extra}` : text;
}
function title(spec) {
    const given = spec.title?.trim();
    if (given)
        return given;
    const line = spec.prompt.trim().split("\n")[0] ?? "";
    return clip(line, TITLE_CHARS).text || "Delegated task";
}
export class Orchestrator {
    host;
    options;
    constructor(host, options) {
        this.host = host;
        this.options = options;
    }
    async createSessions(caller, input) {
        const specs = input.sessions ?? [];
        if (!Array.isArray(specs) || specs.length === 0)
            throw fail("sessions must contain at least one entry");
        const me = await this.self(caller);
        const budget = await this.budget(me);
        if (budget.children + specs.length > this.options.maxChildren) {
            throw fail(`Creating ${specs.length} more would exceed maxChildren (${this.options.maxChildren}); this session already created ${budget.children}`);
        }
        if (budget.running + specs.length > this.options.maxConcurrent) {
            throw fail(`Starting ${specs.length} more would exceed maxConcurrent (${this.options.maxConcurrent}); ${budget.running} are still running. Wait for some first.`);
        }
        const sessions = [];
        for (const spec of specs)
            sessions.push((await this.createOne(caller, me, spec, budget)).created);
        return { sessions };
    }
    async sendMessage(caller, input) {
        const target = await this.target(caller, input.sessionID);
        if (target.id === caller.sessionID)
            throw fail("send_message targets other sessions; reply normally in this one");
        const text = input.text?.trim();
        if (!text)
            throw fail("text must not be empty");
        const delivery = input.delivery ?? "queue";
        const key = input.clientRequestId ? requestKey(caller.sessionID, input.clientRequestId) : undefined;
        if (key) {
            const stored = await this.host.storage.get(key);
            if (stored && typeof stored === "object" && "messageID" in stored && typeof stored.messageID === "string") {
                return { sessionID: target.id, messageID: stored.messageID, delivery };
            }
        }
        const message = await this.host.session.prompt({ sessionID: target.id, text, delivery });
        if (key)
            await this.host.storage.set(key, { messageID: message.id, sessionID: target.id });
        return { sessionID: target.id, messageID: message.id, delivery };
    }
    async readSession(caller, input) {
        const target = await this.target(caller, input.sessionID);
        const messages = await this.host.session.context({ sessionID: target.id });
        const limit = Math.min(Math.max(input.limit ?? this.options.messageLimit, 1), MAX_MESSAGES);
        const offset = Math.max(input.offset ?? 0, 0);
        const end = Math.max(messages.length - offset, 0);
        const start = Math.max(end - limit, 0);
        const selected = [];
        let budget = this.options.maxReadChars;
        let truncated = false;
        for (let i = end - 1; i >= start; i--) {
            const message = messages[i];
            if (!message)
                continue;
            if (budget <= 0) {
                truncated = true;
                break;
            }
            const summary = summarize(message, budget);
            budget -= summary.text?.length ?? 0;
            if (summary.truncated)
                truncated = true;
            selected.unshift(summary);
        }
        const last = finalText(messages);
        const final = last === undefined ? undefined : clip(last, FINAL_TEXT_CHARS);
        return {
            session: describe(target),
            total: messages.length,
            offset,
            messages: selected,
            finalText: final?.text,
            truncated: truncated || (final?.truncated ?? false),
        };
    }
    async waitForSessions(caller, input) {
        const ids = [...new Set(input.sessionIDs ?? [])];
        if (ids.length === 0)
            throw fail("sessionIDs must contain at least one session");
        if (ids.length > this.options.maxWaitSessions)
            throw fail(`Wait on at most ${this.options.maxWaitSessions} sessions at a time`);
        if (ids.includes(caller.sessionID))
            throw fail("wait_for_sessions targets other sessions; this one is running the call and would never finish");
        for (const id of ids)
            await this.target(caller, id);
        return this.wait(caller, ids, input.mode ?? "all", input.timeoutMs);
    }
    async interruptSession(caller, input) {
        const target = await this.target(caller, input.sessionID);
        if (target.id === caller.sessionID)
            throw fail("interrupt_session targets other sessions; this one is running the call");
        const result = await this.host.session.interrupt({ sessionID: target.id });
        return { sessionID: target.id, interrupted: result.interrupted };
    }
    async listSessions(caller, input) {
        const me = await this.self(caller);
        const scope = input.scope ?? "children";
        const limit = Math.min(Math.max(input.limit ?? LIST_LIMIT, 1), LIST_LIMIT);
        if (scope === "children") {
            const children = (await this.host.session.list({ parentID: me.id, limit })).data;
            const independents = await this.independents(me.id);
            const extra = [];
            for (const id of independents) {
                if (children.some((c) => c.id === id))
                    continue;
                try {
                    extra.push(await this.host.session.get({ sessionID: id }));
                }
                catch {
                    // Deleted since it was recorded.
                }
            }
            return { sessions: [...children, ...extra].slice(0, limit).map(describe) };
        }
        if (scope === "siblings") {
            if (me.parentID === undefined)
                return { sessions: [] };
            const siblings = (await this.host.session.list({ parentID: me.parentID, limit })).data;
            return { sessions: siblings.filter((s) => s.id !== me.id).map(describe) };
        }
        if (this.options.scope !== "project")
            throw fail('Listing project sessions needs the plugin option scope: "project"');
        const all = (await this.host.session.list({ project: me.projectID, limit })).data;
        return { sessions: all.map(describe) };
    }
    async delegateTask(caller, input) {
        const me = await this.self(caller);
        const budget = await this.budget(me);
        const { created, info, promptedAt } = await this.createOne(caller, me, { ...input, mode: "child" }, budget);
        if (input.wait === false)
            return { session: created, state: "running", timedOut: false };
        const outcome = await this.wait(caller, [info.id], "all", input.timeoutMs, created.reused ? undefined : promptedAt);
        const result = outcome.results[0];
        if (!result)
            throw fail("Wait returned no result");
        return {
            session: created,
            state: result.state,
            outcome: result.outcome,
            reason: result.reason,
            result: result.finalText,
            timedOut: outcome.timedOut,
        };
    }
    async wait(caller, ids, mode, timeoutMs, since) {
        const timeout = Math.min(Math.max(timeoutMs ?? this.options.defaultWaitMs, MIN_WAIT_MS), this.options.maxWaitMs);
        await caller.progress?.({ title: `Waiting on ${ids.length} session${ids.length === 1 ? "" : "s"}` });
        const outcome = await waitForSessions(this.host, ids, {
            timeoutMs: timeout,
            mode,
            signal: caller.signal,
            since,
            onProgress: (pending) => {
                void caller.progress?.({ title: pending ? `Waiting on ${pending} session${pending === 1 ? "" : "s"}` : "Sessions finished" });
            },
        });
        const results = [];
        for (const result of outcome.results) {
            if (result.state !== "finished") {
                results.push(result);
                continue;
            }
            const messages = await this.host.session.context({ sessionID: result.sessionID });
            const last = finalText(messages);
            results.push({ ...result, finalText: last === undefined ? undefined : clip(last, FINAL_TEXT_CHARS).text });
        }
        return { results, timedOut: outcome.timedOut, aborted: outcome.aborted };
    }
    async createOne(caller, me, spec, budget) {
        if (typeof spec?.prompt !== "string")
            throw fail("Each session needs a prompt");
        const mode = spec.mode ?? "child";
        if (mode !== "child" && mode !== "independent")
            throw fail('mode must be "child" or "independent"');
        const key = spec.clientRequestId ? requestKey(caller.sessionID, spec.clientRequestId) : undefined;
        if (key) {
            const existing = await this.remembered(key);
            if (existing)
                return { created: { ...describe(existing), reused: true }, info: existing, promptedAt: undefined };
        }
        const depth = budget.depth + 1;
        if (mode === "child" && depth > this.options.maxDepth) {
            throw fail(`Depth limit reached: this session is at depth ${budget.depth} and maxDepth is ${this.options.maxDepth}`);
        }
        if (budget.children >= this.options.maxChildren) {
            throw fail(`This session already created ${budget.children} sessions; maxChildren is ${this.options.maxChildren}`);
        }
        if (budget.running >= this.options.maxConcurrent) {
            throw fail(`${budget.running} sessions created here are still running; maxConcurrent is ${this.options.maxConcurrent}. Wait for one first.`);
        }
        const text = compose(spec.prompt, spec.context);
        const model = parseModel(spec.model, this.options.models) ?? me.model;
        const agent = spec.agent ?? me.agent;
        if (this.options.assertSubagentPermission && agent) {
            await this.host.permission.assert({
                sessionID: caller.sessionID,
                agent: caller.agent,
                action: "subagent",
                resources: [agent],
                source: { type: "tool", messageID: caller.messageID, id: caller.id },
            });
        }
        const info = await this.host.session.create({
            parentID: mode === "child" ? caller.sessionID : undefined,
            title: title(spec),
            agent,
            model,
            location: { directory: spec.directory ?? me.location.directory },
            metadata: { [METADATA_KEY]: { creator: caller.sessionID, mode, depth } },
            permissions: me.permissions,
        });
        budget.children += 1;
        budget.running += 1;
        if (key)
            await this.host.storage.set(key, { sessionID: info.id });
        if (mode === "independent")
            await this.recordIndependent(caller.sessionID, info.id);
        const promptedAt = Date.now();
        await this.host.session.prompt({ sessionID: info.id, text, delivery: "queue" });
        return { created: { ...describe(info), reused: false }, info, promptedAt };
    }
    async self(caller) {
        try {
            return await this.host.session.get({ sessionID: caller.sessionID });
        }
        catch {
            throw fail(`The calling session ${caller.sessionID} could not be read`);
        }
    }
    async target(caller, sessionID) {
        if (typeof sessionID !== "string" || !sessionID)
            throw fail("sessionID is required");
        const me = await this.self(caller);
        let target;
        try {
            target = await this.host.session.get({ sessionID });
        }
        catch {
            throw fail(`Session ${sessionID} was not found`);
        }
        if (!(await reachable(this.host, me, target, this.options.scope))) {
            throw fail(`Session ${sessionID} is outside this session's scope: only sessions it created, its descendants and siblings are reachable`);
        }
        return target;
    }
    async budget(me) {
        const depth = (await ancestors(this.host, me)).length;
        const children = (await this.host.session.list({ parentID: me.id, limit: LIST_LIMIT })).data;
        const independents = await this.independents(me.id);
        let count = children.length;
        let active = children.filter(running).length;
        for (const id of independents) {
            if (children.some((c) => c.id === id))
                continue;
            try {
                const info = await this.host.session.get({ sessionID: id });
                count += 1;
                if (running(info))
                    active += 1;
            }
            catch {
                // Deleted since it was recorded.
            }
        }
        return { depth, children: count, running: active };
    }
    async remembered(key) {
        const stored = await this.host.storage.get(key);
        if (!stored || typeof stored !== "object" || !("sessionID" in stored) || typeof stored.sessionID !== "string")
            return undefined;
        try {
            const info = await this.host.session.get({ sessionID: stored.sessionID });
            if (marker(info))
                return info;
        }
        catch {
            // The session is gone; forget the id so a retry creates a fresh one.
        }
        await this.host.storage.remove(key);
        return undefined;
    }
    async independents(callerID) {
        const stored = await this.host.storage.get(createdKey(callerID));
        return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
    }
    async recordIndependent(callerID, sessionID) {
        const current = await this.independents(callerID);
        if (!current.includes(sessionID))
            await this.host.storage.set(createdKey(callerID), [...current, sessionID]);
    }
}
//# sourceMappingURL=orchestrator.js.map