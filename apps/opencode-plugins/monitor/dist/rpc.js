import { Rpc } from "@opencode/plugin/rpc";
const id = { type: "string", minLength: 1 };
/** What the desktop row asks of the monitor plugin: which of these monitors still run, and stop one. Ids and booleans only. */
export const MonitorControl = Rpc.define({
    id: "monitor",
    methods: {
        running: {
            input: { type: "object", properties: { ids: { type: "array", items: id, maxItems: 200 } }, required: ["ids"], additionalProperties: false },
            output: { type: "object", properties: { ids: { type: "array", items: id } }, required: ["ids"], additionalProperties: false },
        },
        stop: {
            input: { type: "object", properties: { id, sessionID: id }, required: ["id", "sessionID"], additionalProperties: false },
            output: { type: "object", properties: { stopped: { type: "boolean" } }, required: ["stopped"], additionalProperties: false },
        },
    },
    events: {},
});
//# sourceMappingURL=rpc.js.map