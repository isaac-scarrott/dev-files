import { Rpc } from "@opencode/plugin/rpc";
const id = { type: "string", minLength: 1 };
const num = { type: "number" };
/** What the desktop asks of the monitor plugin: which of these monitors still run, what runs for a session, and stop one. Ids, names, numbers and booleans only. */
export const MonitorControl = Rpc.define({
    id: "monitor",
    methods: {
        running: {
            input: { type: "object", properties: { ids: { type: "array", items: id, maxItems: 200 } }, required: ["ids"], additionalProperties: false },
            output: { type: "object", properties: { ids: { type: "array", items: id } }, required: ["ids"], additionalProperties: false },
        },
        /** The monitors that wake one session, for the composer chip. */
        list: {
            input: { type: "object", properties: { sessionID: id }, required: ["sessionID"], additionalProperties: false },
            output: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        maxItems: 200,
                        items: {
                            type: "object",
                            properties: {
                                id,
                                name: { type: "string" },
                                state: { type: "string", enum: ["running", "waiting", "paused"] },
                                events: num,
                                maxEvents: num,
                                expiresAt: num,
                                nextRearmAt: num,
                            },
                            required: ["id", "name", "state", "events", "expiresAt"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["items"],
                additionalProperties: false,
            },
        },
        stop: {
            input: { type: "object", properties: { id, sessionID: id }, required: ["id", "sessionID"], additionalProperties: false },
            output: { type: "object", properties: { stopped: { type: "boolean" } }, required: ["stopped"], additionalProperties: false },
        },
    },
    events: {},
});
//# sourceMappingURL=rpc.js.map