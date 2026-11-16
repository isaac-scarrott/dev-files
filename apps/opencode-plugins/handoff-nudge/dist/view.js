/**
 * The pill is visible once a tier has fired, until the user dismisses it or the session compacts below that tier. It is
 * never shown for a session the server does not watch (a subagent, another model, another location).
 */
export function pillFor(input) {
    const { sessionID, loaded, text } = input;
    if (!loaded || loaded.sessionID !== sessionID)
        return undefined;
    const { available, context, tier, dismissed } = loaded.state;
    if (!available || tier <= 0 || tier <= dismissed)
        return undefined;
    return { label: text.label(context), title: text.title };
}
//# sourceMappingURL=view.js.map