import { formatTime } from "./resume.js";
/**
 * The pill is visible only while the session is stopped at a usage limit; a failed read shows as a danger pill rather than
 * as nothing, because the user cannot tell "not limited" from "could not ask" otherwise. A subagent has no pill.
 */
export function pillFor(input) {
    const { sessionID, loaded, failed, now, text } = input;
    if (failed)
        return { label: text.failed, icon: "refresh", tone: "danger", title: text.title };
    if (!loaded || loaded.sessionID !== sessionID)
        return undefined;
    const state = loaded.state;
    if (!state.available || !state.limited)
        return undefined;
    if (state.enabled) {
        const label = state.resumesAt !== undefined ? text.waiting(formatTime(state.resumesAt, now)) : text.title;
        return { label, icon: "refresh", tone: "success", title: text.title, toggleTo: false };
    }
    return { label: text.off, icon: "refresh", tone: "warning", title: text.title, toggleTo: true };
}
//# sourceMappingURL=view.js.map