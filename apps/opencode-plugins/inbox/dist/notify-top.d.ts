export interface TopAsk {
    readonly id: string;
    readonly blocked: boolean;
    readonly ageMin: number;
}
export type TopReason = "none" | "top" | "escalate" | "throttled";
export interface TopDecision {
    readonly notify: boolean;
    readonly reason: TopReason;
    /** The escalation thresholds this notification covers, ascending. */
    readonly passed: readonly number[];
}
export interface TopNotifierOptions {
    /** The least time between two notifications. */
    readonly everyMs: number;
    /** Minutes at which a blocked ask raises another notification, ascending. */
    readonly escalateMin: readonly number[];
}
export declare function createTopNotifier(options: TopNotifierOptions): {
    /**
     * Considers the list: `top` is what a notification would name, `blocked` every item whose waiting time escalates. `notify`
     * is true at most once per `everyMs`; a suppressed change is considered again next time, so a throttle delays a
     * notification rather than losing it.
     */
    consider(input: {
        readonly now: number;
        readonly top?: TopAsk;
        readonly blocked?: readonly {
            readonly id: string;
            readonly ageMin: number;
        }[];
    }): TopDecision;
};
