## Code quality

- Always build code cleanly, modularly, and with proper architecture and separation of concerns. Never simply bolt on a feature because I asked for it.
- If you can't find an easy way to build it naturally, and you'd recommend a refactor to make the whole thing clean, stop before starting the work and say so.

## Sub-agents

- Implementation goes to the `general` agent on `opencode-go/deepseek-v4.1-flash`, as a defined problem with a defined output. Be strict about scope.
- Ask for proof of work (diff, command + output, screenshot), not a summary. Do a one-step review of the diff before accepting it.
- Opus (`claude-agent/opus`) for design and high-level work, and ideally to prepare DeepSeek handoffs (specs, UI mocks).

## AWS credentials

- If AWS credentials are expired/missing, refresh them yourself with `aws sso login` (e.g. `aws sso login --profile holibob` on Holibob work) — don't stop to ask me.
