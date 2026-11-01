/** Five-field cron (minute hour day-of-month month day-of-week) evaluated in the process's local time zone. */
const NAMES_MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NAMES_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ALIASES = {
    "@hourly": "0 * * * *",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@weekly": "0 0 * * 0",
    "@monthly": "0 0 1 * *",
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
};
function value(raw, min, max, names, offset, field) {
    const named = names.indexOf(raw.toLowerCase());
    if (named >= 0)
        return named + offset;
    if (!/^\d+$/.test(raw))
        throw new Error(`cron ${field}: "${raw}" is not a number`);
    const n = Number(raw);
    if (n < min || n > max)
        throw new Error(`cron ${field}: ${n} is outside ${min}-${max}`);
    return n;
}
function parseField(text, min, max, field, names = [], offset = 0) {
    const out = new Set();
    for (const part of text.split(",")) {
        const [range = "", stepText, extra] = part.split("/");
        if (extra !== undefined || part === "")
            throw new Error(`cron ${field}: cannot read "${part}"`);
        let step = 1;
        if (stepText !== undefined) {
            if (!/^\d+$/.test(stepText) || Number(stepText) < 1)
                throw new Error(`cron ${field}: step "${stepText}" must be a positive number`);
            step = Number(stepText);
        }
        let from;
        let to;
        if (range === "*") {
            from = min;
            to = max;
        }
        else if (range.includes("-")) {
            const [a = "", b = "", more] = range.split("-");
            if (more !== undefined)
                throw new Error(`cron ${field}: cannot read "${range}"`);
            from = value(a, min, max, names, offset, field);
            to = value(b, min, max, names, offset, field);
            if (from > to)
                throw new Error(`cron ${field}: range ${range} runs backwards`);
        }
        else {
            from = value(range, min, max, names, offset, field);
            to = stepText !== undefined ? max : from;
        }
        for (let n = from; n <= to; n += step)
            out.add(n);
    }
    return out;
}
export function parseCron(expression) {
    const text = expression.trim().replace(/\s+/g, " ");
    const fields = (ALIASES[text.toLowerCase()] ?? text).split(" ");
    if (fields.length !== 5)
        throw new Error(`cron needs 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}: "${expression}"`);
    const [minute = "", hour = "", day = "", month = "", weekday = ""] = fields;
    const weekdays = parseField(weekday, 0, 7, "day-of-week", NAMES_DAY, 0);
    if (weekdays.delete(7))
        weekdays.add(0);
    return {
        minutes: parseField(minute, 0, 59, "minute"),
        hours: parseField(hour, 0, 23, "hour"),
        days: parseField(day, 1, 31, "day-of-month"),
        months: parseField(month, 1, 12, "month", NAMES_MONTH, 1),
        weekdays,
        dayEither: day !== "*" && weekday !== "*",
    };
}
function dayMatches(cron, year, month, day) {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    const byDay = cron.days.has(day);
    const byWeekday = cron.weekdays.has(weekday);
    return cron.dayEither ? byDay || byWeekday : byDay && byWeekday;
}
const MAX_STEPS = 200_000;
/**
 * The first matching minute strictly after `after`, in local time, or undefined when none exists within about 8 years
 * (for example `0 0 31 2 *`). The search walks wall-clock fields (calendar arithmetic through UTC, which has no DST) and
 * converts each candidate to a real instant, so:
 * - a wall time that falls in a spring-forward gap fires once, at the instant the clock lands after the gap;
 * - a wall time that occurs twice in a fall-back hour fires once, at its first occurrence;
 * - month ends are handled by the day check, so `0 0 31 * *` skips short months.
 */
export function nextCron(cron, after) {
    const start = new Date(after);
    start.setSeconds(0, 0);
    const from = start.getTime() + 60_000;
    const local = new Date(from);
    let wall = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), local.getHours(), local.getMinutes());
    const limit = local.getFullYear() + 8;
    for (let step = 0; step < MAX_STEPS; step++) {
        const w = new Date(wall);
        const year = w.getUTCFullYear();
        if (year > limit)
            return undefined;
        const month = w.getUTCMonth();
        const day = w.getUTCDate();
        const hour = w.getUTCHours();
        const minute = w.getUTCMinutes();
        if (!cron.months.has(month + 1)) {
            wall = Date.UTC(year, month + 1, 1);
            continue;
        }
        if (!dayMatches(cron, year, month, day)) {
            wall = Date.UTC(year, month, day + 1);
            continue;
        }
        if (!cron.hours.has(hour)) {
            wall = Date.UTC(year, month, day, hour + 1);
            continue;
        }
        if (!cron.minutes.has(minute)) {
            wall = Date.UTC(year, month, day, hour, minute + 1);
            continue;
        }
        const instant = new Date(year, month, day, hour, minute).getTime();
        if (instant >= from)
            return instant;
        wall = Date.UTC(year, month, day, hour, minute + 1);
    }
    return undefined;
}
//# sourceMappingURL=cron.js.map