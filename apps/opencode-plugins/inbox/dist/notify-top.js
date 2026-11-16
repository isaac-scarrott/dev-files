// One notification for the inbox, never a stream: it fires when what tops the list changes, or when a blocked ask passes
// an escalation threshold, and never more than once per `everyMs`.
export function createTopNotifier(options) {
    let lastTop;
    let lastAt = Number.NEGATIVE_INFINITY;
    const fired = new Map();
    const firedFor = (id) => {
        const held = fired.get(id);
        if (held)
            return held;
        const next = new Set();
        fired.set(id, next);
        return next;
    };
    return {
        /**
         * Considers the list: `top` is what a notification would name, `blocked` every item whose waiting time escalates. `notify`
         * is true at most once per `everyMs`; a suppressed change is considered again next time, so a throttle delays a
         * notification rather than losing it.
         */
        consider(input) {
            if (!input.top) {
                lastTop = undefined;
                fired.clear();
                return { notify: false, reason: "none", passed: [] };
            }
            const blocked = input.blocked ?? (input.top.blocked ? [{ id: input.top.id, ageMin: input.top.ageMin }] : []);
            const present = new Set(blocked.map((item) => item.id));
            for (const id of [...fired.keys()])
                if (!present.has(id))
                    fired.delete(id);
            const passed = [];
            for (const item of blocked) {
                for (const minutes of options.escalateMin) {
                    if (item.ageMin < minutes || firedFor(item.id).has(minutes))
                        continue;
                    if (!passed.includes(minutes))
                        passed.push(minutes);
                }
            }
            const changed = input.top.id !== lastTop;
            if (!changed && passed.length === 0)
                return { notify: false, reason: "none", passed: [] };
            if (input.now - lastAt < options.everyMs)
                return { notify: false, reason: "throttled", passed: passed.sort((a, b) => a - b) };
            for (const item of blocked)
                for (const minutes of options.escalateMin)
                    if (item.ageMin >= minutes)
                        firedFor(item.id).add(minutes);
            lastTop = input.top.id;
            lastAt = input.now;
            return { notify: true, reason: changed ? "top" : "escalate", passed: passed.sort((a, b) => a - b) };
        },
    };
}
//# sourceMappingURL=notify-top.js.map