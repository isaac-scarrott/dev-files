# claude-proxy

Server plugin: routes OpenCode Desktop's Claude Agent provider through the proxy configured in `~/.claude/settings.json` (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`). The provider launches `claude` with `--setting-sources=`, so it never reads that file itself.
