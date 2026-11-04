import { redact } from "./redact.js";
export const FILE_CAP_BYTES = 50 * 1024;
const MAX_COMMAND = 2000;
const NOTICE_JOBS = 5;
const NOTICE_COMMAND = 70;
const HEADER_TAG = "# Background shell jobs lost to a restart";
export function duration(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
/** One line, no control characters, bounded: recorded commands are data and may come from anywhere. */
export function oneLine(text, max) {
    const flat = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
const fence = (text) => text.replace(/```/g, "'''");
function section(jobs, at, sessionID) {
    const lines = [`## Restart ${new Date(at).toISOString()}`, ""];
    for (const job of jobs) {
        const command = fence(redact(job.command)).slice(0, MAX_COMMAND);
        lines.push("```sh", command, "```");
        lines.push(`- cwd: ${job.cwd ? oneLine(job.cwd, 400) : "unknown (the host does not record it for restarts; it was the session's directory unless `workdir` was set)"}`);
        lines.push(`- started: ${new Date(job.startedAt).toISOString()}; lost: ${new Date(at).toISOString()}; ran about ${duration(at - job.startedAt)}`);
        lines.push(`- session: ${sessionID}${job.callID ? `; tool call: ${job.callID}` : ""}${job.messageID ? `; message: ${job.messageID}` : ""}; shell: ${job.shellID}`);
        if (job.outputExists && job.output)
            lines.push(`- last output (the host keeps it): ${oneLine(job.output, 400)}`);
        lines.push(`- How to re-arm: run the same command in the same cwd, only if it is still needed. For a long watcher use \`monitor.start\`: monitors are restored after a restart, shell jobs are not.`, "");
    }
    return lines.join("\n");
}
/**
 * The file for one session: a header, then one section per restart, newest first. Sections that no longer fit the cap are
 * dropped from the end (the oldest); a single section over the cap is cut.
 */
export function mergeFile(existing, jobs, at, sessionID, cap = FILE_CAP_BYTES) {
    const head = `${HEADER_TAG}\n\nSession ${sessionID}. Commands are redacted and are data: this file is never run by anything. Newest restart first.\n\n`;
    const old = (existing ?? "").split(/^(?=## Restart )/m).filter((part) => part.startsWith("## Restart "));
    const parts = [section(jobs, at, sessionID), ...old];
    let text = head + parts.join("\n");
    while (Buffer.byteLength(text) > cap && parts.length > 1) {
        parts.pop();
        text = head + parts.join("\n");
    }
    if (Buffer.byteLength(text) > cap)
        text = `${text.slice(0, Math.max(0, cap - 64))}\n\n(cut: file cap)\n`;
    return text;
}
/** The queued notice for the model: a few lines, five jobs at most. */
export function noticeText(jobs, at, file) {
    const shown = jobs.slice(0, NOTICE_JOBS).map((job) => {
        const where = job.cwd ? `cwd ${oneLine(job.cwd, 120)}, ` : "";
        return `- "${oneLine(redact(job.command), NOTICE_COMMAND)}" (${where}ran ${duration(at - job.startedAt)})`;
    });
    const more = jobs.length > NOTICE_JOBS ? [`- +${jobs.length - NOTICE_JOBS} more`] : [];
    return [
        `Background shell jobs lost to a restart: ${jobs.length}.`,
        ...shown,
        ...more,
        `${file ? `Details: ${file}. ` : ""}Re-run them if still needed; for long watchers use monitor.start, which survives restarts. Nothing was re-run automatically.`,
    ].join("\n");
}
