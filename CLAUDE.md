# CLAUDE.md

Project-specific context for the dev-files repo. Personal/global rules already live in `~/.claude/CLAUDE.md`; this file should not repeat them.

See `README.md` for the user-facing overview.

## What this is

A dotfiles repo where the repo is source of truth. Configs at their normal paths (`~/.zshrc`, `~/.config/nvim`, `~/.claude/settings.json`, IDE settings under `~/Library/Application Support/...`) are symlinks pointing into this repo. Editing a config in its usual place edits the repo.

macOS only. `install.sh` hardcodes Library paths.

## Where things live

- `install.sh` — bootstrap. The `LINKS` array in `install.sh` is the source of truth for what gets symlinked from `~/` into this repo. Any new tracked file goes there.
- `vendor.manifest` — declarative list of upstream files fetched by `scripts/vendor.sh`. Format: `OWNER/REPO REF SRC_PATH DEST_PATH` per line.
- `.githooks/pre-commit` — re-runs `vendor.sh` and re-stages destinations when `vendor.manifest` is in the commit.
- `scripts/drift.sh` — read-only by default; `--fix` re-vendors, bumps submodules, re-links. Refuses on a dirty tree.
- `scripts/test-install.sh` — sandboxed bash tests for `install.sh` against a `mktemp -d` HOME. ~1s.
- `mcp.manifest.json` — canonical MCP server list. `scripts/gen-mcp.sh` renders it per tool: Claude plugin `.mcp.json` files, OpenCode's `opencode.json` `.mcp` key, and Codex's `~/.codex/config.toml`. The `targets` array on each server picks which tools get it.

## Three agent harnesses, one source

Claude Code, OpenCode, and Codex (CLI / IDE extension / desktop app — they share `~/.codex/`) all read the same canonical files, never copies:

- **Instructions**: `global/AGENTS.md` symlinks to `~/.claude/CLAUDE.md`, `~/.config/opencode/AGENTS.md`, and `~/.codex/AGENTS.md`.
- **Skills**: `.claude/skills/*` symlink into each tool's skills dir. The `SKILL.md` frontmatter format is identical across all three.
- **MCP**: rendered from `mcp.manifest.json` (above), not symlinked.

What does *not* port to Codex: slash commands (`.claude/commands/*` depend on `` !`bash` `` injection or sub-agents — neither exists in Codex; Codex is also deprecating prompts in favour of skills) and the `code-simplifier` agent (Codex has no sub-agents). Express anything reusable as a skill if it should reach Codex.

Codex's `~/.codex/config.toml` is **never symlinked** — Codex owns and rewrites it (hook/marketplace state) and it holds secrets. `gen-mcp.sh` only maintains a marked `# >>> dev-files managed MCP` block inside it; everything else is left alone. Don't hand-add an `[mcp_servers.NAME]` to `config.toml` for a name already in the manifest — TOML rejects duplicate tables.

## Rules for changes in this repo

- **Adding a tracked file**: append to `LINKS` in `install.sh`, then run `./install.sh`. Don't `ln -s` by hand.
- **Linking something from a sibling repo**: give `LINKS` an absolute src instead of a repo-relative one (`claude-orchestrate` is the only case). Those links are best-effort — `install.sh` warns and moves on when the repo isn't cloned, and `drift.sh` stays quiet rather than calling it drift.
- **Adding an upstream file**: add a line to `vendor.manifest` and stage it. The pre-commit hook handles the fetch and re-stage. Prefer a commit SHA over `main` when pinning matters.
- **Adding a submodule**: avoid unless the upstream is a whole repo we want as-is. `humanizer` is the only one. For individual files, use `vendor.manifest`.
- **Touching `install.sh` or anything under `scripts/`**: run `./scripts/test-install.sh` before committing.
- **After pulling upstream changes**: `./scripts/drift.sh` to inspect, `--fix` to apply.

## Vendored content

Anything under `.claude/skills/{grill-me,grill-with-docs,improve-codebase-architecture,thermo-nuclear-code-quality-review}/` is fetched by `vendor.sh` from upstream repos listed in `vendor.manifest`. Editing those files by hand is pointless because the next vendor run overwrites them. Patch upstream, or change the manifest source.
