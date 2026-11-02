import { Rpc } from "@opencode/plugin/rpc";
const id = { type: "string", minLength: 1 };
/** The GUI asks for the cache tier of a session; the server reads Claude Code's transcript and answers with numbers only. */
export const CacheTtl = Rpc.define({
    id: "cache-warning",
    methods: {
        learn: {
            input: {
                type: "object",
                properties: {
                    sessionID: id,
                    /** `native.sessionID` of the session's messages, when the caller has it. */
                    nativeSessionID: id,
                },
                required: ["sessionID"],
                additionalProperties: false,
            },
            output: {
                type: "object",
                properties: {
                    /** The tier of the newest request that wrote cache; absent when unknown. */
                    ttl: { type: "string", enum: ["5m", "1h"] },
                    /** Epoch ms that request was logged. */
                    at: { type: "number" },
                },
                additionalProperties: false,
            },
        },
    },
    events: {},
});
//# sourceMappingURL=rpc.js.map