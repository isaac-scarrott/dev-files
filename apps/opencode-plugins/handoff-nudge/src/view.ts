/** What the server's `get` returns for a session. */
export interface SessionState {
  available: boolean
  context: number
  tier: number
  dismissed: number
}

/** The server's answer for one session, tagged with the session it is for. */
export interface Loaded {
  sessionID: string
  state: SessionState
}

export interface PillSpec {
  readonly label: string
  readonly title: string
}

export interface PillText {
  readonly title: string
  label(context: number): string
}

/**
 * The pill is visible once a tier has fired, until the user dismisses it or the session compacts below that tier. It is
 * never shown for a session the server does not watch (a subagent, another model, another location).
 */
export function pillFor(input: { sessionID: string; loaded: Loaded | undefined; text: PillText }): PillSpec | undefined {
  const { sessionID, loaded, text } = input
  if (!loaded || loaded.sessionID !== sessionID) return undefined
  const { available, context, tier, dismissed } = loaded.state
  if (!available || tier <= 0 || tier <= dismissed) return undefined
  return { label: text.label(context), title: text.title }
}
