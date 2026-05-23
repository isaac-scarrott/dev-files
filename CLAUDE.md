# CLAUDE.md

Project-specific context for the dev-files repo. Personal/global rules already live in `~/.claude/CLAUDE.md`; this file should not repeat them.

See `README.md` for the user-facing overview.

## What this is

A dotfiles repo where the repo is source of truth. Configs at their normal paths (`~/.zshrc`, `~/.config/nvim`, `~/.claude/settings.json`, IDE settings under `~/Library/Application Support/...`) are symlinks pointing into this repo. Editing a config in its usual place edits the repo.

macOS only. `install.sh` hardcodes Library paths.

## Where things live

- `install.sh` — bootstrap. The `LINKS` array at `install.sh:16-41` is the source of truth for what gets symlinked from `~/` into this repo. Any new tracked file goes there.
- `vendor.manifest` — declarative list of upstream files fetched by `scripts/vendor.sh`. Format: `OWNER/REPO REF SRC_PATH DEST_PATH` per line.
- `.githooks/pre-commit` — re-runs `vendor.sh` and re-stages destinations when `vendor.manifest` is in the commit.
- `scripts/drift.sh` — read-only by default; `--fix` re-vendors, bumps submodules, re-links. Refuses on a dirty tree.
- `scripts/test-install.sh` — sandboxed bash tests for `install.sh` against a `mktemp -d` HOME. ~1s.

## Rules for changes in this repo

- **Adding a tracked file**: append to `LINKS` in `install.sh`, then run `./install.sh`. Don't `ln -s` by hand.
- **Adding an upstream file**: add a line to `vendor.manifest` and stage it. The pre-commit hook handles the fetch and re-stage. Prefer a commit SHA over `main` when pinning matters.
- **Adding a submodule**: avoid unless the upstream is a whole repo we want as-is. `humanizer` is the only one. For individual files, use `vendor.manifest`.
- **Touching `install.sh` or anything under `scripts/`**: run `./scripts/test-install.sh` before committing.
- **After pulling upstream changes**: `./scripts/drift.sh` to inspect, `--fix` to apply.

## Vendored content

Anything under `.claude/skills/{grill-me,grill-with-docs,improve-codebase-architecture,skill-creator}/` is fetched by `vendor.sh` from upstream repos listed in `vendor.manifest`. Editing those files by hand is pointless because the next vendor run overwrites them. Patch upstream, or change the manifest source.

## Known intentional drift

`.claude/skills/skill-creator/LICENSE.txt` line 190 differs from upstream because local has the copyright filled in (`Copyright 2026 Anthropic, PBC.`); upstream still ships the Apache template placeholder (`[yyyy] [name of copyright owner]`). Don't "fix" it.
