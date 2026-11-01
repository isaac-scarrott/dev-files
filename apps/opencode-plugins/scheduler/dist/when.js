/** Parsing of the times a task can be given: a moment (`at`) and a repeat interval (`every`). */
const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const UNIT_WORDS = {
    s: "s", sec: "s", secs: "s", second: "s", seconds: "s",
    m: "m", min: "m", mins: "m", minute: "m", minutes: "m",
    h: "h", hr: "h", hrs: "h", hour: "h", hours: "h",
    d: "d", day: "d", days: "d",
    w: "w", wk: "w", wks: "w", week: "w", weeks: "w",
};
/** `90m`, `2h`, `1h30m`, `1 day`, `+2h`. A bare number is minutes. Returns milliseconds. */
export function parseDuration(input) {
    if (typeof input === "number") {
        if (!Number.isFinite(input) || input <= 0)
            throw new Error("A duration must be a positive number of minutes");
        return Math.round(input * 60_000);
    }
    const text = input.trim().toLowerCase().replace(/^\+/, "").replace(/^in\s+/, "");
    if (/^\d+(\.\d+)?$/.test(text))
        return parseDuration(Number(text));
    const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*(?:and\s+)?/gy;
    let total = 0;
    let end = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        const unit = UNIT_WORDS[match[2] ?? ""];
        if (!unit)
            throw new Error(`Unknown time unit "${match[2]}" in "${input}". Use s, m, h, d or w, for example 90m or 2h.`);
        total += Number(match[1]) * (UNIT_MS[unit] ?? 0);
        end = pattern.lastIndex;
    }
    if (end === 0 || end < text.length || total <= 0)
        throw new Error(`Cannot read "${input}" as a duration. Examples: 30m, 2h, 1d, 1h30m.`);
    return Math.round(total);
}
/** An absolute ISO time (no zone means local time) or a relative `+2h`. Returns epoch milliseconds. */
export function parseAt(input, now) {
    const text = input.trim();
    if (/^\+|^in\s/i.test(text))
        return now + parseDuration(text);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text))
        throw new Error(`"${input}" has a date but no time. Use 2026-11-02T09:00 or a relative time like +2h.`);
    const at = Date.parse(text);
    if (Number.isNaN(at))
        throw new Error(`Cannot read "${input}" as a time. Use an ISO time such as 2026-11-02T09:00 (local) or a relative one such as +2h.`);
    return at;
}
/** `2h 5m`, for durations in messages. */
export function formatSpan(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    if (total < 60)
        return `${total}s`;
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const parts = [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean);
    return parts.length ? parts.join(" ") : "0m";
}
//# sourceMappingURL=when.js.map