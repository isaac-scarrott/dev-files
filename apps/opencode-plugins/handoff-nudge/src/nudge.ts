/** `412000` → `412k`; sizes are only ever used to tell the agent and the user how big the next request is. */
export function formatTokens(tokens: number): string {
  return `${Math.round(tokens / 1000)}k`
}

export interface Sizes {
  /** The context the next request re-sends. */
  readonly context: number
  /** What the last cold wake wrote to the cache, when one was measured. */
  readonly coldWrite?: number
}

const STEPS = [
  "A handoff is cheaper than continuing here:",
  '1. Update ~/.claude/orchestrator-state/<project>/STATE.md so it matches what is true now.',
  "2. Write HANDOFF-<date>.md beside it, in that state directory (not $TMPDIR): the goal, the decisions taken, what landed, what is running, what is next, and the paths that matter.",
  '3. Start the successor with orchestrate create (create_session, mode "independent") using the same agent and model, with a prompt to read STATE.md and then the handoff.',
  "4. Send the merger and peers the successor's session id.",
  "5. Stop once the successor has the baton.",
  "Advice only; continue if mid-task.",
]

const cost = (sizes: Sizes): string =>
  sizes.coldWrite === undefined
    ? `This session's context is ${formatTokens(sizes.context)} tokens, and every wake re-sends it.`
    : `This session's context is ${formatTokens(sizes.context)} tokens, and every wake re-sends it. The last cold wake wrote ${formatTokens(sizes.coldWrite)} tokens to the cache.`

/** The warning posted to the agent when the context reaches a tier. */
export function tierNotice(sizes: Sizes): string {
  return `<handoff-nudge>\n${cost(sizes)}\n${STEPS.join("\n")}\n</handoff-nudge>`
}

/** The warning posted to the agent when a cold wake rewrote a large part of the context. */
export function coldNotice(sizes: Sizes): string {
  const lead = `This session woke after more than an hour idle: its first step wrote ${formatTokens(sizes.coldWrite ?? 0)} tokens to the cache, and every later wake re-sends the context (now ${formatTokens(sizes.context)} tokens).`
  return `<handoff-nudge>\n${lead}\n${STEPS.join("\n")}\n</handoff-nudge>`
}

/** What "Hand off now" queues as a user prompt: the same instruction, without the injected-message wrapper. */
export function handoffPrompt(sizes: Sizes): string {
  return `${cost(sizes)}\n${STEPS.join("\n")}`
}
