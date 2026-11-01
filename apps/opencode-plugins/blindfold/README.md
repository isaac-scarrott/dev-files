# Blindfold

Agents use secrets you provide without ever seeing their values.

> **Credit:** this is [vimtor](https://github.com/vimtor)'s [opencode-blindfold](https://github.com/vimtor/opencode-plugins/tree/main/packages/opencode-blindfold) 0.5.0 (MIT), vendored unchanged and pinned in `vendor.manifest`. The idea, the redaction and the code are all vimtor's. Please star and use the original.

## What it does
- The agent asks for a named secret (`blindfold.get`); you paste it into a dialog and the value goes to the plugin, never to the agent.
- Code Mode returns the value to the running code only; shell commands get it as an environment variable only when the command names it.
- The value and its JSON, URL, base64 and hex forms are replaced with `[REDACTED:NAME]` in tool results, errors, messages, system prompts and raw provider requests.

The full documentation is upstream's README, kept here unchanged: [README.upstream.md](README.upstream.md).

## Install
Register this checkout by absolute path in `~/.config/opencode/opencode.json` (server and Desktop) and `~/.config/opencode/cli.json` (TUI), then restart the app. See [PROVENANCE.md](PROVENANCE.md) for what differs from upstream (build files only).

Kind: server, TUI and GUI in one package.

## Development
Upstream files are re-fetched by `scripts/vendor.sh` from the pinned commit; do not edit them here. Local notes live in `PROVENANCE.md`.
