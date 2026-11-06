import { appendFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const MAX_SAMPLE_CHARS = 20_000;
const LOG_CHARS = 300;
// Order matters: structured forms first so their value is replaced whole.
const SECRETS = [
    [/("?(?:access_token|refresh_token|id_token|api[_-]?key|authorization|x-api-key|password|secret)"?\s*[:=]\s*)"?(?:Bearer\s+)?[^",\s}]+"?/gi, "$1[redacted]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]"],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[redacted-jwt]"],
    [/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]"],
    [/\b[A-Fa-f0-9]{40,}\b/g, "[redacted-hex]"],
    [/\b[A-Za-z0-9+/_-]{48,}={0,2}/g, "[redacted-blob]"],
];
export function redact(text) {
    return SECRETS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}
export function oneLine(text, limit = LOG_CHARS) {
    const clean = redact(text ?? "").replace(/\s+/g, " ").trim();
    return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}
/** Text that reads like a usage or rate limit but did not match the detector. */
export const LIMIT_LIKE = /limit|quota|usage|429|rate.?limit|exhaust|resets?\b|overage|billing/i;
export function defaultSampleDir() {
    const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
    return path.join(base, "opencode", "usage-resume");
}
/**
 * Keeps the first real error of each kind as a JSON file, redacted of tokens, so the detector can be tested against what
 * the provider really sends. Never overwrites: the first sighting is the sample.
 */
export class Samples {
    deps;
    saved = new Set();
    constructor(deps) {
        this.deps = deps;
    }
    async saveFirst(name, error) {
        if (this.saved.has(name))
            return;
        this.saved.add(name);
        try {
            await mkdir(this.deps.dir, { recursive: true });
            const body = redact(JSON.stringify({ savedAt: new Date(this.deps.now()).toISOString(), error }, null, 2)).slice(0, MAX_SAMPLE_CHARS);
            const file = path.join(this.deps.dir, `${name}.json`);
            await writeFile(file, body + "\n", { flag: "wx" });
            this.deps.log(`saved a sample of the first ${name} to ${file}`);
        }
        catch (error) {
            if (error.code !== "EEXIST")
                this.deps.log(`could not save ${name} sample: ${String(error)}`);
        }
    }
}
const MAX_LOG_BYTES = 1_000_000;
/**
 * The plugin API has no logger and the service's stderr is not kept anywhere a user can read, so every line goes both to
 * stderr and to `usage-resume.log` beside the samples. The file is rotated once at startup when it passes 1 MB.
 */
export function createLog(dir, now) {
    const file = path.join(dir, "usage-resume.log");
    let ready = (async () => {
        await mkdir(dir, { recursive: true });
        const size = await stat(file).then((s) => s.size).catch(() => 0);
        if (size > MAX_LOG_BYTES)
            await rename(file, `${file}.1`);
    })().catch(() => { });
    return (message) => {
        const safe = redact(message);
        const line = `${new Date(now()).toISOString()} ${safe}`;
        console.error(`[usage-resume] ${safe}`);
        ready = ready.then(() => appendFile(file, line + "\n")).catch(() => { });
    };
}
//# sourceMappingURL=diag.js.map