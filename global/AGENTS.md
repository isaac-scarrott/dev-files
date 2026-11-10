## Code quality

- Always build code cleanly, modularly, and with proper architecture and separation of concerns. Never simply bolt on a feature because I asked for it.
- If you can't find an easy way to build it naturally, and you'd recommend a refactor to make the whole thing clean, stop before starting the work and say so.

## AWS credentials

- If AWS credentials are expired/missing, refresh them yourself with `aws sso login` (e.g. `aws sso login --profile holibob` on Holibob work) — don't stop to ask me.
