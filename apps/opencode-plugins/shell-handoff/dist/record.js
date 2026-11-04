import { redact } from "./redact.js";
export const JOB_PREFIX = "job/";
export const NOTICE_PREFIX = "notice/";
export const jobKey = (shellID) => `${JOB_PREFIX}${shellID}`;
export const noticeKey = (sessionID) => `${NOTICE_PREFIX}${sessionID}`;
const str = (value) => (typeof value === "string" && value.length > 0 ? value : undefined);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
/** Anything stored that does not have the shape is ignored, and removed by the caller. */
export function parseJob(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const o = value;
    const shellID = str(o.shellID);
    const sessionID = str(o.sessionID);
    const command = str(o.command);
    const startedAt = num(o.startedAt);
    const boot = str(o.boot);
    if (!shellID || !sessionID || !command || startedAt === undefined || !boot)
        return undefined;
    return {
        shellID,
        sessionID,
        // Defence in depth: whatever was stored is redacted again before it is shown.
        command: redact(command),
        cwd: str(o.cwd),
        pid: num(o.pid),
        output: str(o.output),
        startedAt,
        timeout: num(o.timeout),
        callID: str(o.callID),
        messageID: str(o.messageID),
        boot,
    };
}
export function parseNotice(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const o = value;
    const text = str(o.text);
    const at = num(o.at);
    return text && at !== undefined ? { text, at } : undefined;
}
