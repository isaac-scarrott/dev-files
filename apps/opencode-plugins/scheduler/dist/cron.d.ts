/** Five-field cron (minute hour day-of-month month day-of-week) evaluated in the process's local time zone. */
export interface Cron {
    readonly minutes: ReadonlySet<number>;
    readonly hours: ReadonlySet<number>;
    readonly days: ReadonlySet<number>;
    readonly months: ReadonlySet<number>;
    readonly weekdays: ReadonlySet<number>;
    /** Both day fields were restricted: a day matches when either does, as in Vixie cron. */
    readonly dayEither: boolean;
}
export declare function parseCron(expression: string): Cron;
/**
 * The first matching minute strictly after `after`, in local time, or undefined when none exists within about 8 years
 * (for example `0 0 31 2 *`). The search walks wall-clock fields (calendar arithmetic through UTC, which has no DST) and
 * converts each candidate to a real instant, so:
 * - a wall time that falls in a spring-forward gap fires once, at the instant the clock lands after the gap;
 * - a wall time that occurs twice in a fall-back hour fires once, at its first occurrence;
 * - month ends are handled by the day check, so `0 0 31 * *` skips short months.
 */
export declare function nextCron(cron: Cron, after: number): number | undefined;
