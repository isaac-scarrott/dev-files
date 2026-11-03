import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
const KEEP = 50;
export const defaultAuditFile = () => join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opencode", "blindfold", "audit.jsonl");
/** The last entries stay in memory for the settings page; each is also appended to a JSONL file (mode 0600) unless `file` is false. */
export function audit(file) {
    const recent = [];
    // Appends run in order, one after the other.
    let written = Promise.resolve();
    return {
        add(entry) {
            recent.push(entry);
            if (recent.length > KEEP)
                recent.shift();
            if (file === false)
                return;
            // The file is a convenience: a failed write must never fail the use it describes.
            written = written
                .then(() => mkdir(dirname(file), { recursive: true, mode: 0o700 }))
                .then(() => appendFile(file, JSON.stringify(entry) + "\n", { mode: 0o600 }))
                .catch(() => undefined);
        },
        recent: () => recent.slice().reverse(),
    };
}
