# dev-files

My dotfiles. Source of truth lives in this repo, not in `~/`. Anything tracked here is symlinked into the spot it normally lives, so editing a config in its usual place is editing the repo. `git status` shows the change like any other edit.

Built so I'd stop having to remember which copy of a file was newer.

## New machine

```bash
git clone --recurse-submodules https://github.com/isaac-scarrott/dev-files ~/git/dev-files
cd ~/git/dev-files
./install.sh
```

`install.sh` is idempotent. It points `core.hooksPath` at `.githooks`, inits submodules, runs `scripts/vendor.sh` to fetch upstream files, then walks the `LINKS` array and symlinks each entry into your home dir. Anything already sitting at a destination gets renamed to `*.bak.<timestamp>` before the symlink lands.

macOS only for now. The Library paths are baked in.

## Layout

```
.claude/         claude code: skills, scripts, settings
.config/         editor + wm config (nvim, zed, aerospace, ghostty, alacritty)
.githooks/       pre-commit re-runs vendor.sh when the manifest changes
ide/             vscode + cursor settings.json (live under Library/Application Support/)
scripts/         vendor.sh, drift.sh, test-install.sh
.zshrc           shell
.tmux.conf       tmux
install.sh       bootstrap; also the canonical list of symlinks
vendor.manifest  upstream files to keep in sync
```

Two files live here for the symlink but git ignores them: `.claude/CLAUDE.md` (personal) and `.config/nvim/lazy-lock.json` (rewrites itself on every `:Lazy update`).

## Vendoring upstream files

`vendor.manifest` pulls individual files from public repos so I don't have to register a whole repo as a submodule for each one:

```
# format: OWNER/REPO REF SRC_PATH DEST_PATH
mattpocock/skills main skills/productivity/grill-me/SKILL.md .claude/skills/grill-me/SKILL.md
```

Add a line, stage `vendor.manifest`, commit. The pre-commit hook re-runs `scripts/vendor.sh` and stages the fetched file before the commit lands. Swap `main` for a commit SHA if you want the version pinned.

`humanizer` gets the real submodule treatment because I want the whole repo, not one file out of it.

## Drift

`scripts/drift.sh` checks for three kinds of drift:

1. every entry in `install.sh`'s `LINKS` resolves to the right path in this repo
2. every vendored file matches its upstream byte-for-byte
3. each submodule's pinned SHA matches upstream HEAD on its tracking branch

```bash
./scripts/drift.sh         # report only
./scripts/drift.sh --fix   # re-vendor, bump submodules, re-link
```

`--fix` refuses on a dirty tree so any change it makes lands in a reviewable diff.

## Tests

```bash
./scripts/test-install.sh
```

Sandboxed in a `mktemp -d` HOME. Covers fresh install, idempotent re-run, backup of real files, and replacement of wrong-target symlinks. Runs in about a second using just bash and a tmpdir.

## Gotchas

- Editors that save by atomic replace (write a new file, rename over the old) turn a symlink into a real file the first time you save. Neovim, Zed, VS Code and Cursor all save in place, so they're fine. Worth knowing if a config ever quietly stops syncing.
- `core.hooksPath` doesn't travel with a clone (security feature). `install.sh` sets it. Skip the install step and the manifest auto-refetch won't fire.
