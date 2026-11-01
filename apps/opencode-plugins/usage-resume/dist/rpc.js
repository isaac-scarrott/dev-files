import { Rpc } from "@opencode/plugin/rpc";
const sessionID = { type: "string", minLength: 1 };
const enabled = { type: "boolean" };
/** The GUI and the server plugin are separate processes; the server owns the state and the GUI reads and writes it here. */
export const UsageResume = Rpc.define({
    id: "usage-resume",
    methods: {
        get: {
            input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
            output: {
                type: "object",
                properties: {
                    enabled,
                    /** False for a subagent session: it is never resumed, so the toggle is not offered. */
                    available: enabled,
                    /** The session's last run stopped at a usage limit and it has not moved on since. */
                    limited: enabled,
                    /** Epoch ms of the next check while the session is waiting to resume. */
                    resumesAt: { type: "number" },
                },
                required: ["enabled", "available", "limited"],
                additionalProperties: false,
            },
        },
        set: {
            input: {
                type: "object",
                properties: { sessionID, enabled },
                required: ["sessionID", "enabled"],
                additionalProperties: false,
            },
            output: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
        },
        getDefault: {
            input: { type: "object", properties: {}, additionalProperties: false },
            output: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
        },
        setDefault: {
            input: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
            output: { type: "object", properties: { enabled }, required: ["enabled"], additionalProperties: false },
        },
    },
    events: {
        changed: {
            schema: {
                type: "object",
                properties: { sessionID: { type: "string" } },
                additionalProperties: false,
            },
        },
    },
});
//# sourceMappingURL=rpc.js.map