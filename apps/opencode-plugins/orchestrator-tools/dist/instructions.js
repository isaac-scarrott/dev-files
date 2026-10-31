export const TOOL_PREFIX = "orchestrate_";
export const INSTRUCTIONS = `Orchestration tools (orchestrate_*) run work in other OpenCode sessions.
- Use orchestrate_delegate_task for a self-contained task whose result you need now: it creates a child session, sends only your prompt, waits, and returns the child's final reply.
- Use orchestrate_create_session for several parallel workers, then orchestrate_wait_for_sessions and orchestrate_read_session to collect what they did.
- A child starts with no history from this session, so put everything it needs in the prompt or the context field: files, goals, constraints, and what to report back.
- Use orchestrate_send_message to follow up or steer a running child, orchestrate_interrupt_session to stop one, and orchestrate_list_sessions to see your children.
- Pass the same clientRequestId when retrying a create, delegate or send so the retry reuses the existing session or message.
- Waits are bounded. When a result says running, wait again or read the session later; the child keeps working.`;
//# sourceMappingURL=instructions.js.map