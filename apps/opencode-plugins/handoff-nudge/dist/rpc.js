import { Rpc } from "@opencode/plugin/rpc";
import { notificationSchema } from "./notify.js";
const sessionID = { type: "string", minLength: 1 };
/** The GUI and the server plugin are separate processes; the server owns the state and the GUI reads and acts on it here. */
export const HandoffNudge = Rpc.define({
    id: "handoff-nudge",
    methods: {
        get: {
            input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
            output: {
                type: "object",
                properties: {
                    /** False for a subagent, another location's session or a model the options do not name. */
                    available: { type: "boolean" },
                    /** The last measured context, in tokens. */
                    context: { type: "number" },
                    /** The highest tier fired and not re-armed; 0 for none. */
                    tier: { type: "number" },
                    /** The tier the user dismissed with "Not now". */
                    dismissed: { type: "number" },
                },
                required: ["available", "context", "tier", "dismissed"],
                additionalProperties: false,
            },
        },
        handoff: {
            input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
            output: { type: "object", properties: { queued: { type: "boolean" } }, required: ["queued"], additionalProperties: false },
        },
        dismiss: {
            input: { type: "object", properties: { sessionID }, required: ["sessionID"], additionalProperties: false },
            output: { type: "object", properties: { dismissed: { type: "boolean" } }, required: ["dismissed"], additionalProperties: false },
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
        /** One per tier, through the `notifications` hub: a mark, never a toast. */
        notify: { schema: notificationSchema },
    },
});
//# sourceMappingURL=rpc.js.map