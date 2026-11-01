import { open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
/** Most of the file that is ever read, from the end. */
export const TAIL_BYTES = 256 * 1024;
const FIRST_READ = 64 * 1024;
/** Claude Code session ids are UUIDs; anything with a separator or dot could leave the projects folder. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const projectsRoot = () => join(homedir(), ".claude", "projects");
/** The folder Claude Code names for a working directory: every `/` and `.` becomes `-`. */
export const encodeCwd = (cwd) => cwd.replace(/[/.]/g, "-");
/**
 * The tier of the newest request in `text` that wrote cache (1h if it wrote to the 1 hour tier, else 5m), read from
 * numbers only. A request served wholly from cache writes nothing and names no tier, so it is passed over: the last
 * known tier carries forward. When the text starts mid-file, `partial` drops the first, cut-off line.
 */
export function newestWrite(text, partial) {
    const lines = text.split("\n");
    if (partial)
        lines.shift();
    for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        if (!line || !line.includes("ephemeral_"))
            continue;
        let entry;
        try {
            entry = JSON.parse(line);
        }
        catch {
            continue;
        }
        const learned = tierOf(entry);
        if (learned)
            return learned;
    }
}
function tierOf(entry) {
    const record = object(entry);
    const usage = object(object(record?.message)?.usage);
    const creation = object(usage?.cache_creation);
    if (!record || !creation)
        return;
    const hour = creation.ephemeral_1h_input_tokens;
    const five = creation.ephemeral_5m_input_tokens;
    const ttl = typeof hour === "number" && hour > 0 ? "1h" : typeof five === "number" && five > 0 ? "5m" : undefined;
    if (!ttl)
        return;
    const at = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : Number.NaN;
    if (Number.isNaN(at))
        return;
    return { ttl, at };
}
function object(value) {
    return value && typeof value === "object" ? value : undefined;
}
async function tail(path, size, bytes) {
    const length = Math.min(size, bytes);
    const file = await open(path, "r");
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await file.read(buffer, 0, length, size - length);
        return buffer.toString("utf8", 0, bytesRead);
    }
    finally {
        await file.close();
    }
}
/** Where the transcript of a native session lives, if it does. Never returns a path outside `root`. */
export async function findTranscript(root, nativeID, cwd) {
    if (!SAFE_ID.test(nativeID))
        return;
    const base = await realpath(root).catch(() => undefined);
    if (!base)
        return;
    const inside = async (path) => {
        const real = await realpath(path).catch(() => undefined);
        return real && real.startsWith(base + sep) ? real : undefined;
    };
    if (cwd) {
        const direct = await inside(join(base, encodeCwd(cwd), `${nativeID}.jsonl`));
        if (direct)
            return direct;
    }
    for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory())
            continue;
        const found = await inside(join(base, entry.name, `${nativeID}.jsonl`));
        if (found)
            return found;
    }
}
/** Reads transcripts' tails and remembers the answer for as long as the file is unchanged. */
export class Transcripts {
    root;
    seen = new Map();
    constructor(root = projectsRoot()) {
        this.root = root;
    }
    /** The tier the session's newest cache write used; undefined when it cannot be told. Never throws. */
    async learn(nativeID, cwd) {
        try {
            const path = await findTranscript(this.root, nativeID, cwd);
            if (!path)
                return;
            const info = await stat(path);
            const cached = this.seen.get(path);
            if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size)
                return cached.learned;
            let learned;
            for (const bytes of [FIRST_READ, TAIL_BYTES]) {
                learned = newestWrite(await tail(path, info.size, bytes), info.size > bytes);
                if (learned || info.size <= bytes)
                    break;
            }
            this.seen.set(path, { mtimeMs: info.mtimeMs, size: info.size, learned });
            return learned;
        }
        catch {
            return;
        }
    }
}
//# sourceMappingURL=transcript.js.map