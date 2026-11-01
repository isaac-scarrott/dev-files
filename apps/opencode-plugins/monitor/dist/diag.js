import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
const MAX_LOG_BYTES = 1_000_000;
const LOG_CHARS = 300;
export function oneLine(text, limit = LOG_CHARS) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}
/**
 * The plugin API has no logger, so every line goes to stderr and to `monitor.log` in `dir`. Rotated once at startup
 * past 1 MB. Output lines of monitored commands are never logged, only lifecycle events.
 */
export function createLog(dir, now) {
    const file = path.join(dir, "monitor.log");
    let ready = (async () => {
        await mkdir(dir, { recursive: true });
        const size = await stat(file).then((s) => s.size).catch(() => 0);
        if (size > MAX_LOG_BYTES)
            await rename(file, `${file}.1`);
    })().catch(() => { });
    return (message) => {
        console.error(`[monitor] ${message}`);
        const line = `${new Date(now()).toISOString()} ${message}\n`;
        ready = ready.then(() => appendFile(file, line)).catch(() => { });
    };
}
//# sourceMappingURL=diag.js.map