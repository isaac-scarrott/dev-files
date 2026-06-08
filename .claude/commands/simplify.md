---
description: Run the code-simplifier sub-agent on recently modified code.
---

Spawn the `code-simplifier` sub-agent via the Agent tool to simplify and refine the code that has been modified in this session.

Scope:
- If the user passes arguments after `/simplify`, treat them as scope (e.g. specific files, a directory, or "the whole diff").
- Otherwise, default to the recently modified files in this session.

Brief the agent with:
- The exact files / scope to review.
- What changed in this session (so it knows what's "recent").
- A reminder to preserve functionality exactly — only refactor for clarity, consistency, and project conventions (CLAUDE.md).

After it returns, summarise the changes it made in 1–2 sentences. Don't re-read every edited file to verify — trust the agent's report unless the user asks for a deeper check.
