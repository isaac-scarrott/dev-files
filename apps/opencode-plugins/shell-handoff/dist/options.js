import { homedir } from "node:os";
import { join } from "node:path";
export const defaultDir = () => join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "shell-handoff");
const int = (value, fallback, min, max) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);
export function parseOptions(raw) {
    const o = (typeof raw === "object" && raw !== null ? raw : {});
    return {
        retentionDays: int(o.retentionDays, 7, 1, 365),
        maxRecords: int(o.maxRecords, 200, 1, 5000),
        notice: bool(o.notice, true),
        file: bool(o.file, true),
        notify: bool(o.notify, true),
        dir: typeof o.dir === "string" && o.dir.length > 0 ? o.dir : defaultDir(),
    };
}
