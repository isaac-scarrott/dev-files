export const NAMESPACE = "orchestrate";
const sessionID = { type: "string", minLength: 1, description: "Session id" };
const createSpec = {
    type: "object",
    properties: {
        prompt: { type: "string", minLength: 1, description: "The task. This is the only message the session receives, so include every file, goal and constraint it needs." },
        title: { type: "string", description: "Session title; defaults to the first line of the prompt" },
        directory: { type: "string", description: "Working directory; defaults to the caller's" },
        agent: { type: "string", description: "Agent id to run; defaults to the caller's agent" },
        model: { type: "string", description: "provider/model id; defaults to the caller's model" },
        context: { type: "string", description: "Extra text appended to the prompt, for example findings so far" },
        clientRequestId: { type: "string", description: "Your own id for this request. A retry with the same id returns the existing session instead of creating another." },
    },
    required: ["prompt"],
    additionalProperties: false,
};
export function registerTools(editor, orchestrator, options) {
    editor.namespace({
        name: NAMESPACE,
        description: "Run work in other OpenCode sessions: create them, prompt them, wait for them, read their results, stop them.",
    });
    const caller = (context) => ({
        sessionID: context.sessionID,
        agent: context.agent,
        messageID: context.messageID,
        id: context.id,
        signal: context.signal,
        progress: context.progress,
    });
    const add = (name, description, input, run) => {
        editor.add({
            name,
            description,
            input,
            options: { namespace: NAMESPACE, codemode: true },
            async execute(raw, context) {
                const output = await run(raw, caller(context));
                return { output, content: JSON.stringify(output) };
            },
        });
    };
    add("create_session", `Create one or more sessions, each with its own prompt, and start them. mode "child" (default) makes them children of this session; "independent" makes top-level sessions. Limits: ${options.maxChildren} sessions per creator, depth ${options.maxDepth}, ${options.maxConcurrent} running at once.`, {
        type: "object",
        properties: {
            sessions: {
                type: "array",
                minItems: 1,
                maxItems: options.maxChildren,
                items: {
                    ...createSpec,
                    properties: {
                        ...createSpec.properties,
                        mode: { type: "string", enum: ["child", "independent"], description: 'Lineage: "child" of this session (default) or "independent"' },
                    },
                },
            },
        },
        required: ["sessions"],
        additionalProperties: false,
    }, (input, c) => orchestrator.createSessions(c, input));
    add("send_message", 'Send text to a session you can reach. delivery "queue" (default) runs after its current work; "steer" interrupts the current step and delivers now.', {
        type: "object",
        properties: {
            sessionID,
            text: { type: "string", minLength: 1 },
            delivery: { type: "string", enum: ["queue", "steer"] },
            clientRequestId: { type: "string", description: "A retry with the same id returns the existing message id" },
        },
        required: ["sessionID", "text"],
        additionalProperties: false,
    }, (input, c) => orchestrator.sendMessage(c, input));
    add("read_session", `Status of a session plus its latest messages (newest last) and the final assistant text. limit defaults to ${options.messageLimit}, max 50; offset skips that many messages from the end. Output is capped at ${options.maxReadChars} characters.`, {
        type: "object",
        properties: {
            sessionID,
            limit: { type: "integer", minimum: 1, maximum: 50 },
            offset: { type: "integer", minimum: 0 },
        },
        required: ["sessionID"],
        additionalProperties: false,
    }, (input, c) => orchestrator.readSession(c, input));
    add("wait_for_sessions", `Wait until sessions finish their current work. mode "all" (default) waits for every one, "any" returns at the first. Returns per-session state (finished, running, deleted, missing), outcome and final text. timeoutMs defaults to ${options.defaultWaitMs} and is capped at ${options.maxWaitMs}; a timeout returns state running rather than failing.`, {
        type: "object",
        properties: {
            sessionIDs: { type: "array", items: sessionID, minItems: 1, maxItems: options.maxWaitSessions },
            timeoutMs: { type: "integer", minimum: 1000, maximum: options.maxWaitMs },
            mode: { type: "string", enum: ["all", "any"] },
        },
        required: ["sessionIDs"],
        additionalProperties: false,
    }, (input, c) => orchestrator.waitForSessions(c, input));
    add("interrupt_session", "Stop a session's current run. Its history stays; send_message starts it again.", { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false }, (input, c) => orchestrator.interruptSession(c, input));
    add("list_sessions", `Sessions this one can reach. scope "children" (default) lists sessions it created, "siblings" those sharing its parent${options.scope === "project" ? ', "project" every session in the project' : ""}.`, {
        type: "object",
        properties: {
            scope: { type: "string", enum: options.scope === "project" ? ["children", "siblings", "project"] : ["children", "siblings"] },
            limit: { type: "integer", minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
    }, (input, c) => orchestrator.listSessions(c, input ?? {}));
    add("delegate_task", `Create a child session, send it the prompt, wait for it to finish and return its final reply as result. The child gets only the prompt and context, never this session's history. wait false returns right after starting. A timeout returns state running with the session id; wait_for_sessions or read_session picks it up later. timeoutMs defaults to ${options.defaultWaitMs}.`, {
        type: "object",
        properties: {
            ...createSpec.properties,
            wait: { type: "boolean", description: "Wait for the child to finish (default true)" },
            timeoutMs: { type: "integer", minimum: 1000, maximum: options.maxWaitMs },
        },
        required: ["prompt"],
        additionalProperties: false,
    }, (input, c) => orchestrator.delegateTask(c, input));
}
//# sourceMappingURL=tools.js.map