import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
const MAX_FIELD_CHARS = 300;
function oneLine(text, limit = MAX_FIELD_CHARS) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}
/** A command line and a path are data from anywhere: flattened and cut before either reach a log line. */
export function logField(text) {
    return oneLine(text);
}
/**
 * Every action goes to `log.jsonl` in the plugin's data directory and to stderr, in the monitor's style. The plugin API
 * has no logger, and this one is where Isaac reviews three days of `dryRun` before it kills anything.
 */
export function createLog(dir, now) {
    const file = path.join(dir, "log.jsonl");
    let ready = mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => { });
    return (entry) => {
        const line = JSON.stringify({ at: now(), ...entry });
        process.stderr.write(`[session-procs] ${line}\n`);
        ready = ready.then(() => appendFile(file, `${line}\n`, { mode: 0o600 })).catch(() => { });
    };
}
